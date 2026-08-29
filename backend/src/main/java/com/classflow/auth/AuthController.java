package com.classflow.auth;

import com.classflow.common.ApiException;
import com.classflow.notification.NotificationService;
import com.classflow.security.AuthCookies;
import com.classflow.security.CurrentUser;
import com.classflow.security.LoginRateLimiter;
import com.classflow.security.UserPrincipal;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthenticationManager authenticationManager;
    private final AuthCookies cookies;
    private final CurrentUser currentUser;
    private final JdbcClient jdbc;
    private final PasswordEncoder passwords;
    private final NotificationService notifications;
    private final LoginRateLimiter loginLimiter;
    private final PasswordResetService passwordResets;

    public AuthController(AuthenticationManager authenticationManager, AuthCookies cookies, CurrentUser currentUser,
                          JdbcClient jdbc, PasswordEncoder passwords, NotificationService notifications,
                          LoginRateLimiter loginLimiter, PasswordResetService passwordResets) {
        this.authenticationManager = authenticationManager;
        this.cookies = cookies;
        this.currentUser = currentUser;
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.notifications = notifications;
        this.loginLimiter = loginLimiter;
        this.passwordResets = passwordResets;
    }

    /**
     * Self-service sign-up. Only TEACHER and STUDENT may register here: ADMIN accounts are
     * provisioned from configuration by AdminBootstrap so the admin role cannot be claimed
     * by anyone who can reach the public API.
     */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserView register(@Valid @RequestBody RegisterRequest request) {
        var role = request.role().toUpperCase();
        if (!("TEACHER".equals(role) || "STUDENT".equals(role))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Role must be TEACHER or STUDENT");
        }

        var email = request.email().trim().toLowerCase();
        var fullName = request.fullName().trim();
        if (jdbc.sql("SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(email)=:email)")
                .param("email", email).query(Boolean.class).single()) {
            throw new ApiException(HttpStatus.CONFLICT, "Email is already registered");
        }

        try {
            var id = jdbc.sql("""
                    INSERT INTO users(email, password_hash, full_name, role, active)
                    VALUES (:email, :password, :name, :role, true) RETURNING id
                    """).param("email", email)
                    .param("password", passwords.encode(request.password()))
                    .param("name", fullName)
                    .param("role", role)
                    .query(Long.class).single();
            notifications.notifyAdmins(null, "USER_REGISTERED", "New " + role.toLowerCase() + " signed up",
                    fullName + " (" + email + ")", role.equals("TEACHER") ? "teachers" : "students");
            return new UserView(id, email, fullName, role, null, null, null, true, null);
        } catch (DuplicateKeyException duplicate) {
            // Two concurrent sign-ups for the same address: the unique index is the source of truth.
            throw new ApiException(HttpStatus.CONFLICT, "Email is already registered");
        }
    }

    /**
     * Signs in, counting consecutive failures for the address so a password list cannot be
     * worked through at the speed of the server. The count is checked before the password is
     * verified and cleared the moment one is correct.
     */
    @PostMapping("/login")
    public UserView login(@Valid @RequestBody LoginRequest request, HttpServletResponse response) {
        var email = request.email().trim().toLowerCase();
        loginLimiter.check(email);
        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(email, request.password()));
        } catch (AuthenticationException failed) {
            loginLimiter.recordFailure(email);
            throw failed;
        }
        loginLimiter.recordSuccess(email);
        var user = (UserPrincipal) authentication.getPrincipal();
        cookies.issue(user, response);
        return UserView.from(user);
    }

    /**
     * Starts a password reset. Answers the same way whether or not the address has an account:
     * telling the caller would turn this into a way to find out who is registered here, and
     * the person who does own the address learns the answer from their inbox anyway.
     *
     * Teachers and students only. The admin account is provisioned from configuration, not
     * recovered through email - see PasswordResetService.
     */
    @PostMapping("/forgot-password")
    public Map<String, Object> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        passwordResets.requestReset(request.email());
        // The lifetime is returned rather than written into the page, so the number the user
        // is told is always the one the server actually enforces.
        return Map.of(
                "message", "If that address has a ClassFlow account, a link to choose a new password is on its way.",
                "expiresInMinutes", passwordResets.linkLifetimeMinutes());
    }

    /**
     * Checks a link before the reset page renders its form, so an expired or already-used link
     * says so straight away instead of after somebody has typed a new password twice.
     */
    @GetMapping("/reset-password")
    public Map<String, Object> checkResetToken(@RequestParam(defaultValue = "") String token) {
        var account = passwordResets.requireValidToken(token);
        // The address is echoed back because it tells the holder of the link which account they
        // are about to change - useful on a shared machine, and no more than the link itself
        // already grants them.
        return Map.of("valid", true, "email", account.email(), "fullName", account.fullName());
    }

    /**
     * Finishes the reset. No cookie is issued: signing somebody in on the strength of a link
     * that arrived by email would undo the point of having signed every session out, so they
     * sign in once with the password they have just chosen.
     */
    @PostMapping("/reset-password")
    public Map<String, String> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        passwordResets.reset(request.token(), request.password());
        return Map.of("message", "Your password has been changed. Sign in with your new password.");
    }

    @GetMapping("/me")
    public UserView me(Authentication authentication) {
        return UserView.from(currentUser.require(authentication));
    }

    @PostMapping("/logout")
    public Map<String, Boolean> logout(HttpServletResponse response) {
        cookies.clear(response);
        return Map.of("success", true);
    }

    public record ForgotPasswordRequest(
            @NotBlank(message = "Email is required") @Email(message = "Enter a valid email address")
            @Size(max = 190, message = "Email address is too long") String email) {}

    /**
     * The same 8-to-72 bound as sign-up and the profile's own password change: BCrypt reads
     * only the first 72 bytes, so anything longer would not be stored as the user typed it.
     */
    public record ResetPasswordRequest(
            @NotBlank(message = "The reset link is missing its token")
            @Size(max = 200, message = "That reset token is not valid") String token,
            @NotBlank(message = "Password is required")
            @Size(min = 8, max = 72, message = "Password must be between 8 and 72 characters") String password) {}

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}

    /**
     * The length caps mirror the columns these values are written to, so an over-long entry
     * comes back as a clear 400 instead of failing at the database and surfacing as a 500.
     * The password cap is different in kind: BCrypt reads only the first 72 bytes, so a
     * longer one is silently truncated, and a password that is not stored as typed is worth
     * rejecting rather than accepting under a false impression.
     */
    public record RegisterRequest(
            @NotBlank(message = "Email is required") @Email(message = "Enter a valid email address")
            @Size(max = 190, message = "Email address is too long") String email,
            @NotBlank(message = "Password is required")
            @Size(min = 8, max = 72, message = "Password must be between 8 and 72 characters") String password,
            @NotBlank(message = "Full name is required")
            @Size(max = 120, message = "Full name is too long") String fullName,
            @NotBlank(message = "Role is required")
            @Pattern(regexp = "(?i)TEACHER|STUDENT", message = "Role must be TEACHER or STUDENT") String role
    ) {}

    public record UserView(
            Long id,
            String email,
            String fullName,
            String role,
            String phone,
            String bio,
            String avatarUrl,
            boolean active,
            java.time.OffsetDateTime createdAt
    ) {
        static UserView from(UserPrincipal user) {
            return new UserView(user.id(), user.email(), user.fullName(), user.role(), null, null,
                    user.avatarUrl(), user.active(), null);
        }
    }
}
