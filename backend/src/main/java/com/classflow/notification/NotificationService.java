package com.classflow.notification;

import java.util.Collection;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Creates the notifications behind the bell in the top bar.
 *
 * Delivery is best effort, like the activity log: telling someone about a thing is never
 * worth failing the thing itself, so a write that fails is logged and swallowed. A student
 * would rather their submission succeed with no notification than see it rejected because
 * the teacher's alert could not be written.
 *
 * The audience helpers below are the only place course membership is turned into a recipient
 * list, so every caller notifies exactly the people who can already see what it refers to.
 */
@Service
public class NotificationService {
    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);
    private static final int MAX_BODY = 500;

    private final JdbcClient jdbc;

    public NotificationService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Everyone approved on a course, optionally excluding the person who caused the event. */
    public void notifyCourseStudents(Long courseId, Long except, String type, String title, String body, String link) {
        send(jdbc.sql("""
                SELECT e.student_id FROM course_enrollments e
                JOIN courses c ON c.id=e.course_id
                JOIN users u ON u.id=e.student_id
                WHERE e.course_id=:course AND e.status='APPROVED' AND c.active AND u.active
                """).param("course", courseId).query(Long.class).list(), except, type, title, body, link);
    }

    /** The teacher who runs a course. */
    public void notifyCourseTeacher(Long courseId, Long except, String type, String title, String body, String link) {
        send(jdbc.sql("""
                SELECT c.teacher_id FROM courses c JOIN users u ON u.id=c.teacher_id
                WHERE c.id=:course AND u.active
                """).param("course", courseId).query(Long.class).list(), except, type, title, body, link);
    }

    public void notifyUser(Long userId, String type, String title, String body, String link) {
        send(List.of(userId), null, type, title, body, link);
    }

    /** Every active admin, for platform-level events such as a new sign-up. */
    public void notifyAdmins(Long except, String type, String title, String body, String link) {
        send(jdbc.sql("SELECT id FROM users WHERE role='ADMIN' AND active")
                .query(Long.class).list(), except, type, title, body, link);
    }

    private void send(Collection<Long> recipients, Long except, String type, String title, String body, String link) {
        try {
            for (var userId : recipients) {
                // Nobody needs telling about something they just did themselves.
                if (userId == null || userId.equals(except)) continue;
                jdbc.sql("""
                        INSERT INTO notifications(user_id, type, title, body, link)
                        VALUES (:user, :type, :title, :body, :link)
                        """).param("user", userId).param("type", type).param("title", trim(title, 200))
                        .param("body", trim(body, MAX_BODY)).param("link", link).update();
            }
        } catch (RuntimeException failure) {
            log.warn("Could not deliver {} notification", type, failure);
        }
    }

    private String trim(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max - 1) + "…";
    }
}
