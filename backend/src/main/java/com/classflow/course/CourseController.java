package com.classflow.course;

import com.classflow.common.ApiException;
import com.classflow.common.CourseAccess;
import com.classflow.common.PageResponse;
import com.classflow.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/courses")
public class CourseController {
    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final CourseAccess access;

    public CourseController(JdbcClient jdbc, CurrentUser currentUser, CourseAccess access) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.access = access;
    }

    @GetMapping
    public PageResponse<CourseView> list(Authentication authentication,
                                         @RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "20") int size) {
        var user = currentUser.require(authentication);
        size = Math.min(Math.max(size, 1), 100);
        page = Math.max(page, 0);
        var condition = switch (user.role()) {
            case "TEACHER" -> "WHERE c.teacher_id = :user";
            case "STUDENT" -> "JOIN course_enrollments mine ON mine.course_id=c.id WHERE mine.student_id = :user";
            default -> "";
        };
        var sql = """
                SELECT c.id, c.title, c.code, c.description, c.subject, c.active, c.teacher_id,
                       u.full_name AS teacher_name, c.created_at,
                       (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id=c.id) AS student_count
                FROM courses c JOIN users u ON u.id=c.teacher_id %s
                ORDER BY c.created_at DESC LIMIT :size OFFSET :offset
                """.formatted(condition);
        var query = jdbc.sql(sql).param("size", size).param("offset", page * size);
        if (!"ADMIN".equals(user.role())) query = query.param("user", user.id());
        var items = query.query(CourseView.class).list();
        var countSql = "SELECT COUNT(*) FROM courses c " + condition;
        var count = jdbc.sql(countSql);
        if (!"ADMIN".equals(user.role())) count = count.param("user", user.id());
        return new PageResponse<>(items, count.query(Long.class).single(), page, size);
    }

    @GetMapping("/{id}")
    public CourseView get(@PathVariable Long id, Authentication authentication) {
        access.requireView(id, currentUser.require(authentication));
        return require(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CourseView create(@Valid @RequestBody CourseRequest request, Authentication authentication) {
        var user = currentUser.require(authentication);
        if (!List.of("ADMIN", "TEACHER").contains(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Only teachers can create courses");
        }
        var teacherId = "ADMIN".equals(user.role()) && request.teacherId() != null ? request.teacherId() : user.id();
        var id = jdbc.sql("""
                INSERT INTO courses(title, code, description, subject, teacher_id)
                VALUES (:title, :code, :description, :subject, :teacher) RETURNING id
                """).param("title", request.title()).param("code", request.code().toUpperCase())
                .param("description", request.description()).param("subject", request.subject())
                .param("teacher", teacherId).query(Long.class).single();
        log(user.id(), "COURSE_CREATED", request.title());
        return require(id);
    }

    @PostMapping("/{id}/enrollments")
    @ResponseStatus(HttpStatus.CREATED)
    public void enroll(@PathVariable Long id, @RequestBody EnrollmentRequest request, Authentication authentication) {
        access.requireManage(id, currentUser.require(authentication));
        jdbc.sql("""
                INSERT INTO course_enrollments(course_id, student_id) VALUES (:course, :student)
                ON CONFLICT (course_id, student_id) DO NOTHING
                """).param("course", id).param("student", request.studentId()).update();
    }

    @GetMapping("/{id}/lessons")
    public List<LessonView> lessons(@PathVariable Long id, Authentication authentication) {
        access.requireView(id, currentUser.require(authentication));
        return jdbc.sql("""
                SELECT id, course_id, title, description, position, created_at
                FROM lessons WHERE course_id=:id ORDER BY position, id
                """).param("id", id).query(LessonView.class).list();
    }

    @PostMapping("/{id}/lessons")
    @ResponseStatus(HttpStatus.CREATED)
    public LessonView lesson(@PathVariable Long id, @Valid @RequestBody LessonRequest request,
                             Authentication authentication) {
        access.requireManage(id, currentUser.require(authentication));
        var lessonId = jdbc.sql("""
                INSERT INTO lessons(course_id, title, description, position)
                VALUES (:course, :title, :description, :position) RETURNING id
                """).param("course", id).param("title", request.title()).param("description", request.description())
                .param("position", request.position()).query(Long.class).single();
        return jdbc.sql("""
                SELECT id, course_id, title, description, position, created_at FROM lessons WHERE id=:id
                """).param("id", lessonId).query(LessonView.class).single();
    }

    private CourseView require(Long id) {
        return jdbc.sql("""
                SELECT c.id, c.title, c.code, c.description, c.subject, c.active, c.teacher_id,
                       u.full_name AS teacher_name, c.created_at,
                       (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id=c.id) AS student_count
                FROM courses c JOIN users u ON u.id=c.teacher_id WHERE c.id=:id
                """).param("id", id).query(CourseView.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Course not found"));
    }

    private void log(Long user, String action, String details) {
        jdbc.sql("INSERT INTO activity_logs(user_id, action, details) VALUES (:user, :action, :details)")
                .param("user", user).param("action", action).param("details", details).update();
    }

    public record CourseView(Long id, String title, String code, String description, String subject, boolean active,
                             Long teacherId, String teacherName, OffsetDateTime createdAt, long studentCount) {}
    public record CourseRequest(@NotBlank String title, @NotBlank String code, String description,
                                @NotBlank String subject, Long teacherId) {}
    public record EnrollmentRequest(Long studentId) {}
    public record LessonRequest(@NotBlank String title, String description, int position) {}
    public record LessonView(Long id, Long courseId, String title, String description, int position,
                             OffsetDateTime createdAt) {}
}
