package com.classflow.security;

import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * Issues and clears the sign-in cookies.
 *
 * Signing in is not the only thing that mints a token: changing your own password invalidates
 * every session for the account, including the one making the request, so it has to hand back
 * a fresh cookie. Keeping the cookie attributes in one place stops the two callers drifting
 * apart on flags like httpOnly and sameSite, where a mismatch would be a security bug.
 */
@Component
public class AuthCookies {
    private static final String TOKEN = "classflow_token";
    private static final String ROLE = "classflow_role";
    private static final Duration LIFETIME = Duration.ofHours(12);

    private final JwtService jwt;
    private final boolean secure;

    public AuthCookies(JwtService jwt, @Value("${app.secure-cookies}") boolean secure) {
        this.jwt = jwt;
        this.secure = secure;
    }

    /** Signs the user in on this response: an HTTP-only token plus a readable role hint. */
    public void issue(UserPrincipal user, HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie(TOKEN, jwt.create(user), true, LIFETIME).toString());
        response.addHeader(HttpHeaders.SET_COOKIE,
                cookie(ROLE, user.role().toLowerCase(Locale.ROOT), false, LIFETIME).toString());
    }

    public void clear(HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie(TOKEN, "", true, Duration.ZERO).toString());
        response.addHeader(HttpHeaders.SET_COOKIE, cookie(ROLE, "", false, Duration.ZERO).toString());
    }

    private ResponseCookie cookie(String name, String value, boolean httpOnly, Duration maxAge) {
        return ResponseCookie.from(name, value).httpOnly(httpOnly).secure(secure).sameSite("Lax")
                .path("/").maxAge(maxAge).build();
    }
}
