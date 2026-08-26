package com.classflow.security;

import com.classflow.user.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.Arrays;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService jwt;
    private final UserRepository users;

    public JwtAuthenticationFilter(JwtService jwt, UserRepository users) {
        this.jwt = jwt;
        this.users = users;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var token = token(request);
        if (token != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                var issuedAt = jwt.issuedAt(token);
                users.findPrincipalByEmail(jwt.subject(token))
                        .filter(UserPrincipal::active)
                        .filter(user -> currentForPassword(user, issuedAt))
                        .ifPresent(user -> {
                            var auth = new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
                            SecurityContextHolder.getContext().setAuthentication(auth);
                        });
            } catch (RuntimeException ignored) {
                // Invalid and expired tokens are handled as unauthenticated requests.
            }
        }
        chain.doFilter(request, response);
    }

    /**
     * Rejects a token that was minted before the account's current password.
     *
     * A JWT's issued-at is stored to the second, while the column keeps sub-second precision,
     * so a token minted in the same second as the change would otherwise look stale. The
     * second of leeway absorbs exactly that truncation.
     */
    private boolean currentForPassword(UserPrincipal user, Instant issuedAt) {
        var changedAt = user.passwordChangedAt();
        return changedAt == null || !issuedAt.isBefore(changedAt.minusSeconds(1));
    }

    private String token(HttpServletRequest request) {
        var header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) return header.substring(7);
        if (request.getCookies() == null) return null;
        return Arrays.stream(request.getCookies())
                .filter(cookie -> "classflow_token".equals(cookie.getName()))
                .map(Cookie::getValue).findFirst().orElse(null);
    }
}
