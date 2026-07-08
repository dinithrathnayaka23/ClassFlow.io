package com.classflow.auth;

import com.classflow.common.ApiException;
import com.classflow.security.CurrentUser;
import com.classflow.security.JwtService;
import com.classflow.security.UserPrincipal;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
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

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> register(@Valid @RequestBody RegisterRequest request) {
        // Only TEACHER and STUDENT roles can self-register
        if ("ADMIN".equalsIgnoreCase(request.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Admin accounts cannot be self-registered");
        }
        
        if (!("TEACHER".equalsIgnoreCase(request.role()) || "STUDENT".equalsIgnoreCase(request.role()))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid role. Only TEACHER or STUDENT allowed");
        }
        
        if (jdbc.sql("SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(email)=LOWER(:email))")
                .param("email", request.email()).query(Boolean.class).single()) {
            throw new ApiException(HttpStatus.CONFLICT, "Email is already registered");
        }
        
        var id = jdbc.sql("""
                INSERT INTO users(email, password_hash, full_name, role, active)
                VALUES (:email, :password, :name, :role, true) RETURNING id
                """).param("email", request.email())
                .param("password", passwords.encode(request.password()))
                .param("name", request.fullName())
                .param("role", request.role().toUpperCase())
                .query(Long.class).single();
        
        return Map.of(
            "id", id,
            "email", request.email(),
            "fullName", request.fullName(),
            "role", request.role().toUpperCase()
        );
    }

    @PostMapping("/login")
    public UserView login(@Valid @RequestBody LoginRequest request, HttpServletResponse response) {
        var authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.email(), request.password()));
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

    private UserView get(Long id) {
        var result = jdbc.sql("""
                SELECT id, email, full_name, role, phone, bio, active, created_at FROM users WHERE id=:id
                """).param("id", id).query((rs, rowNum) -> new UserView(
                    rs.getLong("id"),
                    rs.getString("email"),
                    rs.getString("full_name"),
                    rs.getString("role"),
                    rs.getString("phone"),
                    rs.getString("bio"),
                    rs.getBoolean("active"),
                    rs.getObject("created_at", java.time.OffsetDateTime.class)
                )).optional().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
        return result;
    }

    public record LoginRequest(@Email String email, @NotBlank String password) {}
    public record RegisterRequest(
            @Email String email,
            @Size(min = 8, message = "Password must be at least 8 characters") String password,
            @NotBlank(message = "Full name is required") String fullName,
            @Pattern(regexp = "TEACHER|STUDENT", message = "Role must be TEACHER or STUDENT") String role
    ) {}
    public record UserView(
            Long id, 
            String email, 
            @JsonProperty("full_name") String fullName, 
            String role, 
            String phone, 
            String bio, 
            boolean active, 
            @JsonProperty("created_at") java.time.OffsetDateTime createdAt
    ) {
        static UserView from(UserPrincipal user) {
            return new UserView(user.id(), user.email(), user.fullName(), user.role(), null, null, user.active(), null);
        }
    }
}
