package com.classflow.publicinfo;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The figures on the public landing page.
 *
 * Unauthenticated by design, so it publishes aggregate counts and nothing else: no names, no
 * identifiers, nothing that describes an individual. The landing page previously carried
 * invented numbers, which is the thing worth avoiding - a figure on a marketing page should
 * either be true or not be there.
 *
 * Counts follow the same "active" definition the admin dashboard uses, so the public page and
 * the internal one can never disagree about how many students there are.
 */
@RestController
@RequestMapping("/api/public")
public class PublicStatsController {
    private final JdbcClient jdbc;

    public PublicStatsController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/stats")
    public PublicStats stats() {
        return new PublicStats(
                count("SELECT COUNT(*) FROM users WHERE role='STUDENT' AND active"),
                count("SELECT COUNT(*) FROM users WHERE role='TEACHER' AND active"),
                count("SELECT COUNT(*) FROM courses WHERE active"),
                count("SELECT COUNT(*) FROM assignments a JOIN courses c ON c.id=a.course_id WHERE c.active"));
    }

    private long count(String sql) {
        return jdbc.sql(sql).query(Long.class).single();
    }

    public record PublicStats(long students, long teachers, long courses, long assignments) {}
}
