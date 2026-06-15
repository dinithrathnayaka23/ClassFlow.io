package com.classflow.common;

import com.classflow.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
public class CourseAccess {
    private final JdbcClient jdbc;

    public CourseAccess(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void requireView(Long courseId, UserPrincipal user) {
        if ("ADMIN".equals(user.role())) return;
        var allowed = "TEACHER".equals(user.role())
                ? jdbc.sql("SELECT EXISTS(SELECT 1 FROM courses WHERE id=:id AND teacher_id=:user)")
                    .param("id", courseId).param("user", user.id()).query(Boolean.class).single()
                : jdbc.sql("SELECT EXISTS(SELECT 1 FROM course_enrollments WHERE course_id=:id AND student_id=:user)")
                    .param("id", courseId).param("user", user.id()).query(Boolean.class).single();
        if (!allowed) throw new ApiException(HttpStatus.FORBIDDEN, "You do not have access to this course");
    }

    public void requireManage(Long courseId, UserPrincipal user) {
        if ("ADMIN".equals(user.role())) return;
        if (!"TEACHER".equals(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Only teachers can manage course content");
        }
        var allowed = jdbc.sql("SELECT EXISTS(SELECT 1 FROM courses WHERE id=:id AND teacher_id=:user)")
                .param("id", courseId).param("user", user.id()).query(Boolean.class).single();
        if (!allowed) throw new ApiException(HttpStatus.FORBIDDEN, "You do not manage this course");
    }
}
