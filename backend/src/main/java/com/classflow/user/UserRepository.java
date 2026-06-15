package com.classflow.user;

import com.classflow.common.ApiException;
import com.classflow.security.UserPrincipal;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {
    private final JdbcClient jdbc;

    public UserRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<UserPrincipal> findPrincipalByEmail(String email) {
        return jdbc.sql("""
                SELECT id, email, password_hash AS password, full_name, role, active
                FROM users WHERE LOWER(email) = LOWER(:email)
                """).param("email", email).query(UserPrincipal.class).optional();
    }

    public UserPrincipal require(Long id) {
        return jdbc.sql("""
                SELECT id, email, password_hash AS password, full_name, role, active
                FROM users WHERE id = :id
                """).param("id", id).query(UserPrincipal.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
    }
}
