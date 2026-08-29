package com.classflow.auth;

import com.classflow.common.ActivityLog;
import com.classflow.common.ApiException;
import com.classflow.mail.Mailer;
import com.classflow.notification.NotificationService;
import com.classflow.security.AttemptLimiter;
import com.classflow.security.LoginRateLimiter;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Issues and redeems the one-time links behind "forgot password".
 *
 * The flow only exists for TEACHER and STUDENT accounts. An admin is provisioned from
 * configuration by AdminBootstrap and is the account that can reset everybody else's password,
 * so letting it be recovered through the mailbox on file would make that mailbox, rather than
 * the deployment's own configuration, the thing that ultimately controls the platform. An
 * admin who is locked out sets ADMIN_RESET_PASSWORD and restarts instead.
 *
 * Three rules shape the rest of it:
 *
 *   - Nothing the endpoint returns says whether an address is registered. Sign-up is open, so
 *     an answer that differed would turn this into a membership oracle for any address someone
 *     cares to try. Requests for unknown, admin and disabled accounts all take the same path
 *     and produce the same reply; only the mail differs, by not being sent.
 *   - The token is a secret equivalent to the password itself, so it is generated from a
 *     SecureRandom and only ever stored as a SHA-256 digest.
 *   - Redeeming a link is final. It works once, it retires every other outstanding link for
 *     the account, and it moves password_changed_at, which signs the account out everywhere -
 *     the point being that somebody resetting a password may well be locking an intruder out.
 */
@Service
public class PasswordResetService {
    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);

    /** 256 bits of entropy, URL-safe and unpadded, so the link survives being copied by hand. */
    private static final int TOKEN_BYTES = 32;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();

    private final JdbcClient jdbc;
    private final PasswordEncoder passwords;
    private final Mailer mailer;
    private final ActivityLog activity;
    private final NotificationService notifications;
    private final LoginRateLimiter loginLimiter;
    private final Duration ttl;
    private final String webOrigin;
    /**
     * Requests are capped per address, and far more tightly than sign-ins are. Every request
     * puts mail in somebody's inbox, and that somebody is not necessarily the person asking,
     * so a handful an hour is generous for a real user and useless as a way to bury an account
     * in mail. Redeeming a link clears the count.
     */
    private final AttemptLimiter requests = new AttemptLimiter(5, Duration.ofHours(1),
            "Too many reset requests for this address. Check your inbox, or try again later.");

    public PasswordResetService(JdbcClient jdbc, PasswordEncoder passwords, Mailer mailer, ActivityLog activity,
                                NotificationService notifications, LoginRateLimiter loginLimiter,
                                @Value("${app.password-reset.ttl-minutes:30}") long ttlMinutes,
                                @Value("${app.allowed-origin}") String webOrigin) {
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.mailer = mailer;
        this.activity = activity;
        this.notifications = notifications;
        this.loginLimiter = loginLimiter;
        this.ttl = Duration.ofMinutes(ttlMinutes);
        this.webOrigin = webOrigin.endsWith("/") ? webOrigin.substring(0, webOrigin.length() - 1) : webOrigin;
    }

    /** How long an issued link lasts, so the pages and the mail can quote one number. */
    public long linkLifetimeMinutes() {
        return ttl.toMinutes();
    }

    /**
     * Sends a reset link if - and only if - the address belongs to an active teacher or
     * student. Returns nothing either way: see the class comment on why the caller must not be
     * able to tell the difference.
     */
    @Transactional
    public void requestReset(String rawEmail) {
        var email = normalise(rawEmail);
        // Counted before the lookup, so an unknown address is throttled exactly like a known
        // one and the 429 cannot be used to tell them apart.
        requests.check(email);
        requests.record(email);

        var account = findAccount(email);
        if (account.isEmpty()) {
            log.info("Password reset requested for an address with no account; nothing sent.");
            return;
        }
        var user = account.get();
        if ("ADMIN".equals(user.role())) {
            log.warn("Password reset requested for the admin account {}; refused. "
                    + "Use ADMIN_RESET_PASSWORD to rotate it.", email);
            return;
        }
        if (!user.active()) {
            log.info("Password reset requested for a disabled account; nothing sent.");
            return;
        }

        // Any link already outstanding stops working now. Someone who asks twice because the
        // first mail was slow should not be left with two live keys to their account.
        retirePendingTokens(user.id());

        var token = ENCODER.encodeToString(randomBytes());
        jdbc.sql("""
                INSERT INTO password_reset_tokens(user_id, token_hash, expires_at)
                VALUES (:user, :hash, NOW() + make_interval(mins => :minutes))
                """)
                .param("user", user.id())
                .param("hash", digest(token))
                .param("minutes", (int) ttl.toMinutes())
                .update();

        var link = webOrigin + "/reset-password?token=" + token;
        mailer.send(user.email(), "Reset your ClassFlow password",
                resetHtml(user.fullName(), link), resetText(user.fullName(), link));
    }

    /**
     * Checks a link without spending it, so the page behind it can say "this link has expired"
     * before the person has typed a new password rather than after.
     */
    public Account requireValidToken(String token) {
        // A link opened without a token at all - a truncated copy and paste, or the endpoint
        // reached directly - is exactly as unusable as a wrong one, and gets the same answer
        // rather than a 500 from hashing nothing.
        if (token == null || token.isBlank()) throw invalidLink();
        return jdbc.sql("""
                SELECT u.id, u.email, u.full_name, u.role, u.active
                FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
                WHERE t.token_hash = :hash AND t.used_at IS NULL AND t.expires_at > NOW()
                  AND u.active = true AND u.role <> 'ADMIN'
                """).param("hash", digest(token)).query(Account.class).optional()
                .orElseThrow(this::invalidLink);
    }

    /**
     * One message for every way a link can fail - expired, already spent, never existed, or
     * belonging to an account that has since been disabled. Distinguishing them would tell a
     * stranger holding a guessed token which part of their guess was close.
     */
    private ApiException invalidLink() {
        return new ApiException(HttpStatus.BAD_REQUEST, "This reset link is no longer valid. Links expire after "
                + ttl.toMinutes() + " minutes and can be used once - request a new one.");
    }

    /**
     * Spends a link and sets the new password. Everything that makes the reset final happens in
     * one transaction: if any part of it fails the link stays unspent and the old password
     * stays in place, rather than leaving the account half-reset.
     */
    @Transactional
    public void reset(String token, String newPassword) {
        var user = requireValidToken(token);

        var currentHash = jdbc.sql("SELECT password_hash FROM users WHERE id = :id")
                .param("id", user.id()).query(String.class).single();
        if (passwords.matches(newPassword, currentHash)) {
            // The link is left unspent on purpose: nothing has gone wrong that would justify
            // making the person request a new mail, they just need a different password.
            throw new ApiException(HttpStatus.BAD_REQUEST, "Choose a password you have not used here before");
        }

        // Stamping password_changed_at in the same statement is what makes every token issued
        // before this moment stop working - see V5__password_changed_at.sql.
        jdbc.sql("UPDATE users SET password_hash = :hash, password_changed_at = NOW() WHERE id = :id")
                .param("hash", passwords.encode(newPassword)).param("id", user.id()).update();

        // Including every other link for the account: one reset settles the matter.
        retirePendingTokens(user.id());

        // They have just proved they hold the mailbox, so a run of failed sign-ins from before
        // must not keep them out of the account they have only now regained.
        loginLimiter.recordSuccess(user.email());
        requests.clear(user.email());

        activity.record(user.id(), "PASSWORD_RESET_COMPLETED", user.fullName() + " (" + user.role() + ")");
        notifications.notifyUser(user.id(), "PASSWORD_CHANGED", "Your password was reset",
                "Your ClassFlow password was changed using a reset link. "
                        + "If this was not you, contact your administrator immediately.", "profile");
        mailer.send(user.email(), "Your ClassFlow password was changed",
                confirmationHtml(user.fullName()), confirmationText(user.fullName()));
    }

    private Optional<Account> findAccount(String email) {
        return jdbc.sql("SELECT id, email, full_name, role, active FROM users WHERE LOWER(email) = :email")
                .param("email", email).query(Account.class).optional();
    }

    /** Retires every unspent link for the account, this one included. */
    private void retirePendingTokens(Long userId) {
        jdbc.sql("UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = :user AND used_at IS NULL")
                .param("user", userId).update();
    }

    private static byte[] randomBytes() {
        var bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        return bytes;
    }

    /**
     * What goes in the database. The lookup is by digest rather than by a stored token, which
     * is also why no constant-time comparison is needed: the value being matched is a 256-bit
     * hash of the caller's own input, which they would have to guess in full to hit a row.
     */
    static String digest(String token) {
        try {
            var sha = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(sha.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            // Every JVM is required to ship SHA-256.
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }

    private String normalise(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private String resetText(String name, String link) {
        return """
                Hi %s,

                Someone asked to reset the password on your ClassFlow account. Open the link
                below to choose a new one. It expires in %d minutes and works only once.

                %s

                If you did not ask for this you can ignore this message. Your password has not
                changed, and the link cannot be used without this email.
                """.formatted(name, ttl.toMinutes(), link);
    }

    private String resetHtml(String name, String link) {
        return """
                <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111">
                  <h1 style="font-size:20px;margin:0 0 20px">Reset your ClassFlow password</h1>
                  <p style="margin:0 0 16px">Hi %s,</p>
                  <p style="margin:0 0 24px;line-height:1.6">Someone asked to reset the password on your
                    ClassFlow account. Choose a new one using the button below. The link expires in
                    <strong>%d minutes</strong> and works only once.</p>
                  <p style="margin:0 0 28px">
                    <a href="%s" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Choose a new password</a>
                  </p>
                  <p style="margin:0 0 24px;line-height:1.6;font-size:13px;color:#555">
                    If the button does not work, copy this address into your browser:<br>
                    <span style="word-break:break-all">%s</span></p>
                  <p style="margin:0;line-height:1.6;font-size:13px;color:#555">
                    If you did not ask for this you can ignore this message. Your password has not
                    changed, and the link cannot be used without this email.</p>
                </div>
                """.formatted(escape(name), ttl.toMinutes(), link, link);
    }

    private String confirmationText(String name) {
        return """
                Hi %s,

                Your ClassFlow password has just been changed using a reset link, and you have
                been signed out everywhere. Sign in again with your new password.

                If this was not you, contact your administrator immediately.
                """.formatted(name);
    }

    private String confirmationHtml(String name) {
        return """
                <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111">
                  <h1 style="font-size:20px;margin:0 0 20px">Your password was changed</h1>
                  <p style="margin:0 0 16px">Hi %s,</p>
                  <p style="margin:0 0 16px;line-height:1.6">Your ClassFlow password has just been changed
                    using a reset link, and you have been signed out everywhere. Sign in again with your
                    new password.</p>
                  <p style="margin:0;line-height:1.6;font-size:13px;color:#555">
                    If this was not you, contact your administrator immediately.</p>
                </div>
                """.formatted(escape(name));
    }

    /** Names come from sign-up, so they reach the HTML mail as untrusted text. */
    private String escape(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    /** The subset of a user row this flow needs; deliberately without the password hash. */
    public record Account(Long id, String email, String fullName, String role, boolean active) {}
}
