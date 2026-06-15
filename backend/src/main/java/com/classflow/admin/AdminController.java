package com.classflow.admin;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {
    private final JdbcClient jdbc;

    public AdminController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/stats")
    public Map<String, Long> stats() {
        return Map.of(
                "teachers", count("SELECT COUNT(*) FROM users WHERE role='TEACHER' AND active"),
                "students", count("SELECT COUNT(*) FROM users WHERE role='STUDENT' AND active"),
                "courses", count("SELECT COUNT(*) FROM courses WHERE active"),
                "submissions", count("SELECT COUNT(*) FROM assignment_submissions"),
                "quizAttempts", count("SELECT COUNT(*) FROM quiz_attempts WHERE submitted_at IS NOT NULL"),
                "messages", count("SELECT COUNT(*) FROM chat_messages")
        );
    }

    @GetMapping("/activity")
    public List<ActivityView> activity() {
        return jdbc.sql("""
                SELECT a.id, a.action, a.details, u.full_name AS user_name, a.created_at
                FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 25
                """).query(ActivityView.class).list();
    }

    private Long count(String sql) {
        return jdbc.sql(sql).query(Long.class).single();
    }

    public record ActivityView(Long id, String action, String details, String userName, OffsetDateTime createdAt) {}
}
