package com.classflow.user;

import com.classflow.common.ApiException;
import com.classflow.common.PageResponse;
import com.classflow.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private final JdbcClient jdbc;
    private final PasswordEncoder passwords;
    private final CurrentUser currentUser;

    public UserController(JdbcClient jdbc, PasswordEncoder passwords, CurrentUser currentUser) {
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.currentUser = currentUser;
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public PageResponse<UserView> list(@RequestParam(required = false) String role,
                                       @RequestParam(defaultValue = "0") int page,
                                       @RequestParam(defaultValue = "20") int size) {
        size = Math.min(Math.max(size, 1), 100);
        page = Math.max(page, 0);
        var filter = role == null ? "%" : role.toUpperCase();
        var items = jdbc.sql("""
                SELECT id, email, full_name, role, phone, bio, active, created_at
                FROM users WHERE role LIKE :role ORDER BY created_at DESC LIMIT :size OFFSET :offset
                """).param("role", filter).param("size", size).param("offset", page * size)
                .query(UserView.class).list();
        var total = jdbc.sql("SELECT COUNT(*) FROM users WHERE role LIKE :role").param("role", filter)
                .query(Long.class).single();
        return new PageResponse<>(items, total, page, size);
    }

    @GetMapping("/me")
    public UserView me(Authentication authentication) {
        return get(currentUser.require(authentication).id());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    public UserView create(@Valid @RequestBody CreateUser request) {
        if (jdbc.sql("SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(email)=LOWER(:email))")
                .param("email", request.email()).query(Boolean.class).single()) {
            throw new ApiException(HttpStatus.CONFLICT, "Email is already registered");
        }
        var id = jdbc.sql("""
                INSERT INTO users(email, password_hash, full_name, role, phone)
                VALUES (:email, :password, :name, :role, :phone) RETURNING id
                """).param("email", request.email()).param("password", passwords.encode(request.password()))
                .param("name", request.fullName()).param("role", request.role()).param("phone", request.phone())
                .query(Long.class).single();
        return get(id);
    }

    @PatchMapping("/me")
    public UserView updateMe(@Valid @RequestBody UpdateProfile request, Authentication authentication) {
        var user = currentUser.require(authentication);
        jdbc.sql("UPDATE users SET full_name=:name, phone=:phone, bio=:bio WHERE id=:id")
                .param("name", request.fullName()).param("phone", request.phone()).param("bio", request.bio())
                .param("id", user.id()).update();
        return get(user.id());
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    public UserView status(@PathVariable Long id, @RequestBody StatusRequest request) {
        jdbc.sql("UPDATE users SET active=:active WHERE id=:id").param("active", request.active()).param("id", id).update();
        return get(id);
    }

    private UserView get(Long id) {
        return jdbc.sql("""
                SELECT id, email, full_name, role, phone, bio, active, created_at FROM users WHERE id=:id
                """).param("id", id).query(UserView.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
    }

    public record UserView(Long id, String email, String fullName, String role, String phone, String bio,
                           boolean active, OffsetDateTime createdAt) {}
    public record CreateUser(@Email String email, @Size(min = 8) String password, @NotBlank String fullName,
                             @Pattern(regexp = "ADMIN|TEACHER|STUDENT") String role, String phone) {}
    public record UpdateProfile(@NotBlank String fullName, String phone, String bio) {}
    public record StatusRequest(boolean active) {}
}
