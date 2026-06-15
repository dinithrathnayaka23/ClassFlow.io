package com.classflow.auth;

import com.classflow.security.CurrentUser;
import com.classflow.security.JwtService;
import com.classflow.security.UserPrincipal;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthenticationManager authenticationManager;
    private final JwtService jwt;
    private final CurrentUser currentUser;
    private final boolean secureCookies;

    public AuthController(AuthenticationManager authenticationManager, JwtService jwt, CurrentUser currentUser,
                          @Value("${app.secure-cookies}") boolean secureCookies) {
        this.authenticationManager = authenticationManager;
        this.jwt = jwt;
        this.currentUser = currentUser;
        this.secureCookies = secureCookies;
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

    public record LoginRequest(@Email String email, @NotBlank String password) {}
    public record UserView(Long id, String email, String fullName, String role) {
        static UserView from(UserPrincipal user) {
            return new UserView(user.id(), user.email(), user.fullName(), user.role());
        }
    }
}
