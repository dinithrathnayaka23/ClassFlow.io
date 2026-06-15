package com.classflow.config;

import java.time.OffsetDateTime;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class SeedData implements ApplicationRunner {
    private final JdbcClient jdbc;
    private final PasswordEncoder passwords;

    public SeedData(JdbcClient jdbc, PasswordEncoder passwords) {
        this.jdbc = jdbc;
        this.passwords = passwords;
    }

    @Override
    public void run(ApplicationArguments args) {
        createUser("admin@classflow.com", "Admin User", "ADMIN", "Admin123!");
        var teacherId = createUser("teacher@classflow.com", "Nimal Perera", "TEACHER", "Teacher123!");
        var studentId = createUser("student@classflow.com", "Amaya Silva", "STUDENT", "Student123!");
        var count = jdbc.sql("SELECT COUNT(*) FROM courses").query(Long.class).single();
        if (count == 0) {
            var courseId = jdbc.sql("""
                    INSERT INTO courses(title, code, description, subject, teacher_id)
                    VALUES ('Advanced Level Mathematics', 'MATH-A1', 'Structured revision, theory and paper discussions.', 'Mathematics', :teacher)
                    RETURNING id
                    """).param("teacher", teacherId).query(Long.class).single();
            jdbc.sql("INSERT INTO course_enrollments(course_id, student_id) VALUES (:course, :student)")
                    .param("course", courseId).param("student", studentId).update();
            jdbc.sql("""
                    INSERT INTO materials(course_id, title, type, url, created_by)
                    VALUES (:course, 'Functions revision guide', 'LINK', 'https://en.wikipedia.org/wiki/Function_(mathematics)', :teacher)
                    """).param("course", courseId).param("teacher", teacherId).update();
            var assignmentId = jdbc.sql("""
                    INSERT INTO assignments(course_id, title, description, deadline, created_by)
                    VALUES (:course, 'Functions practice paper', 'Complete all structured questions and upload one PDF.',
                            :deadline, :teacher) RETURNING id
                    """).param("course", courseId).param("teacher", teacherId)
                    .param("deadline", OffsetDateTime.now().plusDays(7)).query(Long.class).single();
            jdbc.sql("""
                    INSERT INTO activity_logs(user_id, action, details)
                    VALUES (:teacher, 'COURSE_CREATED', 'Seeded Advanced Level Mathematics course')
                    """).param("teacher", teacherId).update();
        }
    }

    private Long createUser(String email, String name, String role, String password) {
        var existing = jdbc.sql("SELECT id FROM users WHERE email = :email").param("email", email)
                .query(Long.class).optional();
        if (existing.isPresent()) return existing.get();
        return jdbc.sql("""
                INSERT INTO users(email, password_hash, full_name, role)
                VALUES (:email, :password, :name, :role) RETURNING id
                """).param("email", email).param("password", passwords.encode(password))
                .param("name", name).param("role", role).query(Long.class).single();
    }
}
