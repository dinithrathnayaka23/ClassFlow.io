package com.classflow.auth;

import com.classflow.common.ApiException;
import com.classflow.security.CurrentUser;
import com.classflow.security.JwtService;
import com.classflow.security.UserPrincipal;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthenticationManager authenticationManager;
    private final JwtService jwt;
    private final CurrentUser currentUser;
    private final boolean secureCookies;
    private final JdbcClient jdbc;
    private final PasswordEncoder passwords;

    public AuthController(AuthenticationManager authenticationManager, JwtService jwt, CurrentUser currentUser,
                          @Value("${app.secure-cookies}") boolean secureCookies, JdbcClient jdbc, PasswordEncoder passwords) {
        this.authenticationManager = authenticationManager;
        this.jwt = jwt;
        this.currentUser = currentUser;
        this.secureCookies = secureCookies;
        this.jdbc = jdbc;
        this.passwords = passwords;
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
            return new UserView(id, email, fullName, role, null, null, true, null);
        } catch (DuplicateKeyException duplicate) {
            // Two concurrent sign-ups for the same address: the unique index is the source of truth.
            throw new ApiException(HttpStatus.CONFLICT, "Email is already registered");
        }
    }

    @PostMapping("/login")
    public UserView login(@Valid @RequestBody LoginRequest request, HttpServletResponse response) {
        var authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.email().trim().toLowerCase(), request.password()));
        var user = (UserPrincipal) authentication.getPrincipal();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie("classflow_token", jwt.create(user), true).toString());
        response.addHeader(HttpHeaders.SET_COOKIE, cookie("classflow_role", user.role().toLowerCase(), false).toString());
        return UserView.from(user);
    }

    @GetMapping("/me")
    public UserView me(Authentication authentication) {
        return UserView.from(currentUser.require(authentication));
    }

    @PostMapping("/logout")
    public Map<String, Boolean> logout(HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, clear("classflow_token", true).toString());
        response.addHeader(HttpHeaders.SET_COOKIE, clear("classflow_role", false).toString());
        return Map.of("success", true);
    }

    private ResponseCookie cookie(String name, String value, boolean httpOnly) {
        return ResponseCookie.from(name, value).httpOnly(httpOnly).secure(secureCookies).sameSite("Lax")
                .path("/").maxAge(Duration.ofHours(12)).build();
    }

    private ResponseCookie clear(String name, boolean httpOnly) {
        return ResponseCookie.from(name, "").httpOnly(httpOnly).secure(secureCookies).sameSite("Lax")
                .path("/").maxAge(Duration.ZERO).build();
    }

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}

    public record RegisterRequest(
            @NotBlank(message = "Email is required") @Email(message = "Enter a valid email address") String email,
            @NotBlank(message = "Password is required")
            @Size(min = 8, message = "Password must be at least 8 characters") String password,
            @NotBlank(message = "Full name is required") String fullName,
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
            boolean active,
            java.time.OffsetDateTime createdAt
    ) {
        static UserView from(UserPrincipal user) {
            return new UserView(user.id(), user.email(), user.fullName(), user.role(), null, null, user.active(), null);
        }
    }
}
