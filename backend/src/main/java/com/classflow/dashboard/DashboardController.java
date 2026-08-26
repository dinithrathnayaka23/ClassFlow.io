package com.classflow.dashboard;

import com.classflow.security.CurrentUser;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The numbers behind the workspace dashboard tiles.
 *
 * Every figure is something the reader can act on - work that is waiting, a decision that is
 * owed, a message unread - rather than a status word. A tile that always reads "Online" tells
 * nobody anything; a tile reading "3 to mark" sends the teacher somewhere.
 *
 * Counts are scoped the same way the rest of the app is: a student sees only courses they are
 * approved on, a teacher only courses they run.
 */
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {
    private final JdbcClient jdbc;
    private final CurrentUser currentUser;

    public DashboardController(JdbcClient jdbc, CurrentUser currentUser) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
    }

    @GetMapping("/summary")
    public DashboardSummary summary(Authentication authentication) {
        var user = currentUser.require(authentication);
        var unread = count("""
                SELECT COUNT(*) FROM chat_messages WHERE recipient_id=:user AND read_at IS NULL
                """, user.id());

        if ("TEACHER".equals(user.role())) {
            return new DashboardSummary(
                    count("SELECT COUNT(*) FROM courses WHERE teacher_id=:user AND active", user.id()),
                    // Work handed in that still has no mark against it.
                    count("""
                            SELECT COUNT(*) FROM assignment_submissions s
                            JOIN assignments a ON a.id=s.assignment_id
                            JOIN courses c ON c.id=a.course_id
                            WHERE c.teacher_id=:user AND c.active AND s.status <> 'GRADED'
                            """, user.id()),
                    count("""
                            SELECT COUNT(*) FROM course_enrollments e
                            JOIN courses c ON c.id=e.course_id
                            WHERE c.teacher_id=:user AND c.active AND e.status='PENDING'
                            """, user.id()),
                    unread, 0, 0);
        }

        // Students. Both figures deliberately exclude anything already done, so the tiles
        // count what is outstanding rather than what exists.
        var courses = count("""
                SELECT COUNT(*) FROM course_enrollments e JOIN courses c ON c.id=e.course_id
                WHERE e.student_id=:user AND e.status='APPROVED' AND c.active
                """, user.id());
        var assignmentsDue = count("""
                SELECT COUNT(*) FROM assignments a
                JOIN courses c ON c.id=a.course_id
                JOIN course_enrollments e ON e.course_id=c.id AND e.student_id=:user
                WHERE c.active AND e.status='APPROVED' AND a.deadline >= NOW()
                  AND NOT EXISTS (SELECT 1 FROM assignment_submissions s
                                  WHERE s.assignment_id=a.id AND s.student_id=:user)
                """, user.id());
        var quizzesOpen = count("""
                SELECT COUNT(*) FROM quizzes q
                JOIN courses c ON c.id=q.course_id
                JOIN course_enrollments e ON e.course_id=c.id AND e.student_id=:user
                WHERE c.active AND e.status='APPROVED' AND NOW() BETWEEN q.starts_at AND q.ends_at
                  AND NOT EXISTS (SELECT 1 FROM quiz_attempts a
                                  WHERE a.quiz_id=q.id AND a.student_id=:user AND a.submitted_at IS NOT NULL)
                """, user.id());
        return new DashboardSummary(courses, 0, 0, unread, assignmentsDue, quizzesOpen);
    }

    private long count(String sql, Long userId) {
        return jdbc.sql(sql).param("user", userId).query(Long.class).single();
    }

    /**
     * Both roles in one shape. A field that does not apply to the caller's role is zero, and
     * the client shows only the tiles that belong to that role.
     */
    public record DashboardSummary(long courses, long submissionsToMark, long pendingRequests,
                                   long unreadMessages, long assignmentsDue, long quizzesOpen) {}
}
