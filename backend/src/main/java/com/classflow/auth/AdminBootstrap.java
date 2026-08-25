package com.classflow.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Provisions the single ADMIN account from configuration on startup.
 *
 * Admins are deliberately not self-registerable, so without this the platform would have no
 * way to ever get its first admin: POST /api/users requires an authenticated admin already.
 * Runs as an ApplicationRunner, which is after Flyway has migrated the schema.
 */
@Component
public class AdminBootstrap implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

    private final JdbcClient jdbc;
    private final PasswordEncoder passwords;
    private final String email;
    private final String password;
    private final String fullName;
    private final boolean resetPassword;

    public AdminBootstrap(JdbcClient jdbc, PasswordEncoder passwords,
                          @Value("${app.admin.email:}") String email,
                          @Value("${app.admin.password:}") String password,
                          @Value("${app.admin.name:ClassFlow Admin}") String fullName,
                          @Value("${app.admin.reset-password:false}") boolean resetPassword) {
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.email = email == null ? "" : email.trim().toLowerCase();
        this.password = password == null ? "" : password;
        this.fullName = fullName;
        this.resetPassword = resetPassword;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (email.isBlank() || password.isBlank()) {
            log.warn("ADMIN_EMAIL/ADMIN_PASSWORD are not set - no admin account was provisioned.");
            return;
        }
        if (password.length() < 8) {
            log.error("ADMIN_PASSWORD is shorter than 8 characters - refusing to provision the admin account.");
            return;
        }

        var existingId = jdbc.sql("SELECT id FROM users WHERE LOWER(email)=:email")
                .param("email", email).query(Long.class).optional();

        if (existingId.isEmpty()) {
            jdbc.sql("""
                    INSERT INTO users(email, password_hash, full_name, role, active)
                    VALUES (:email, :password, :name, 'ADMIN', true)
                    """).param("email", email)
                    .param("password", passwords.encode(password))
                    .param("name", fullName)
                    .update();
            log.info("Created the ADMIN account for {}.", email);
            return;
        }

        // Keep an existing admin usable: a disabled or demoted row would lock the owner out.
        jdbc.sql("UPDATE users SET role='ADMIN', active=true WHERE id=:id")
                .param("id", existingId.get()).update();

        if (resetPassword) {
            jdbc.sql("UPDATE users SET password_hash=:password WHERE id=:id")
                    .param("password", passwords.encode(password))
                    .param("id", existingId.get()).update();
            log.warn("Reset the ADMIN password for {}. Unset ADMIN_RESET_PASSWORD now.", email);
        } else {
            log.info("ADMIN account for {} already exists - password left unchanged.", email);
        }
    }
}
