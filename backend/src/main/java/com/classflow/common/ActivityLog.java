package com.classflow.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Writes the entries behind the admin dashboard's "Recent platform activity" panel.
 *
 * Recording is best effort on purpose: an audit line is never worth failing the
 * action it describes, so a write that fails is logged and swallowed.
 */
@Component
public class ActivityLog {
    private static final Logger log = LoggerFactory.getLogger(ActivityLog.class);
    private static final int MAX_DETAILS = 500;

    private final JdbcClient jdbc;

    public ActivityLog(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void record(Long userId, String action, String details) {
        try {
            jdbc.sql("INSERT INTO activity_logs(user_id, action, details) VALUES (:user, :action, :details)")
                    .param("user", userId).param("action", action).param("details", trim(details)).update();
        } catch (RuntimeException failure) {
            log.warn("Could not record activity {} for user {}", action, userId, failure);
        }
    }

    private String trim(String details) {
        if (details == null) return null;
        return details.length() <= MAX_DETAILS ? details : details.substring(0, MAX_DETAILS - 1) + "…";
    }
}
