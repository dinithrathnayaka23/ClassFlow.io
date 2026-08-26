package com.classflow.notification;

import com.classflow.common.ApiException;
import com.classflow.security.CurrentUser;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * The bell in the top bar.
 *
 * Every endpoint is scoped to the signed-in user by the WHERE clause rather than by a check
 * afterwards, so there is no path that reads or alters somebody else's notifications.
 */
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
    /** The panel shows a recent window, not the whole history, so it stays quick to open. */
    private static final int MAX_LISTED = 30;

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;

    public NotificationController(JdbcClient jdbc, CurrentUser currentUser) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
    }

    @GetMapping
    public List<NotificationView> list(Authentication authentication) {
        var user = currentUser.require(authentication);
        return jdbc.sql("""
                SELECT id, type, title, body, link, created_at, read_at
                FROM notifications WHERE user_id=:user
                ORDER BY created_at DESC, id DESC LIMIT :limit
                """).param("user", user.id()).param("limit", MAX_LISTED)
                .query(NotificationView.class).list();
    }

    /** Drives the badge, so it is a single indexed count and cheap enough to poll. */
    @GetMapping("/unread")
    public Map<String, Long> unread(Authentication authentication) {
        var user = currentUser.require(authentication);
        return Map.of("total", jdbc.sql("""
                SELECT COUNT(*) FROM notifications WHERE user_id=:user AND read_at IS NULL
                """).param("user", user.id()).query(Long.class).single());
    }

    @PostMapping("/{id}/read")
    public Map<String, Integer> read(@PathVariable Long id, Authentication authentication) {
        var user = currentUser.require(authentication);
        var updated = jdbc.sql("""
                UPDATE notifications SET read_at=NOW()
                WHERE id=:id AND user_id=:user AND read_at IS NULL
                """).param("id", id).param("user", user.id()).update();
        // Already-read is not a failure; only a notification that is not theirs is.
        if (updated == 0 && !exists(id, user.id())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Notification not found");
        }
        return Map.of("marked", updated);
    }

    @PostMapping("/read-all")
    public Map<String, Integer> readAll(Authentication authentication) {
        var user = currentUser.require(authentication);
        return Map.of("marked", jdbc.sql("""
                UPDATE notifications SET read_at=NOW() WHERE user_id=:user AND read_at IS NULL
                """).param("user", user.id()).update());
    }

    /** Clears the list without waiting for the retention sweep, when someone wants it empty. */
    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clear(Authentication authentication) {
        var user = currentUser.require(authentication);
        jdbc.sql("DELETE FROM notifications WHERE user_id=:user").param("user", user.id()).update();
    }

    private boolean exists(Long id, Long userId) {
        return jdbc.sql("SELECT EXISTS(SELECT 1 FROM notifications WHERE id=:id AND user_id=:user)")
                .param("id", id).param("user", userId).query(Boolean.class).single();
    }

    public record NotificationView(Long id, String type, String title, String body, String link,
                                   OffsetDateTime createdAt, OffsetDateTime readAt) {}
}
