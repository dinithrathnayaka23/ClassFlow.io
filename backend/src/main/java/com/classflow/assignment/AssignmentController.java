package com.classflow.assignment;

import com.classflow.common.ApiException;
import com.classflow.common.CourseAccess;
import com.classflow.common.FileStorage;
import com.classflow.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/assignments")
public class AssignmentController {
    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final CourseAccess access;
    private final FileStorage files;

    public AssignmentController(JdbcClient jdbc, CurrentUser currentUser, CourseAccess access, FileStorage files) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.access = access;
        this.files = files;
    }

    @GetMapping
    public List<AssignmentView> list(@RequestParam Long courseId, Authentication authentication) {
        var user = currentUser.require(authentication);
        access.requireView(courseId, user);
        return jdbc.sql("""
                SELECT a.id, a.course_id, a.title, a.description, a.deadline, a.attachment_url, a.created_at,
                       s.status AS submission_status, s.mark, s.feedback
                FROM assignments a
                LEFT JOIN assignment_submissions s ON s.assignment_id=a.id AND s.student_id=:user
                WHERE a.course_id=:course ORDER BY a.deadline
                """).param("course", courseId).param("user", user.id()).query(AssignmentView.class).list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AssignmentView create(@Valid @RequestBody AssignmentRequest request, Authentication authentication) {
        var user = currentUser.require(authentication);
        access.requireManage(request.courseId(), user);
        var id = jdbc.sql("""
                INSERT INTO assignments(course_id, title, description, deadline, attachment_url, created_by)
                VALUES (:course, :title, :description, :deadline, :url, :user) RETURNING id
                """).param("course", request.courseId()).param("title", request.title())
                .param("description", request.description()).param("deadline", request.deadline())
                .param("url", request.attachmentUrl()).param("user", user.id()).query(Long.class).single();
        return get(id, user.id());
    }

    @PostMapping(value = "/{id}/submissions", consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    public SubmissionView submit(@PathVariable Long id, @RequestPart MultipartFile file, Authentication authentication) {
        var user = currentUser.require(authentication);
        if (!"STUDENT".equals(user.role())) throw new ApiException(HttpStatus.FORBIDDEN, "Only students submit work");
        var assignment = jdbc.sql("SELECT course_id, deadline FROM assignments WHERE id=:id").param("id", id)
                .query(AssignmentMeta.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Assignment not found"));
        access.requireView(assignment.courseId(), user);
        var stored = files.save(file, "submissions");
        jdbc.sql("""
                INSERT INTO assignment_submissions(assignment_id, student_id, file_url, file_name, status)
                VALUES (:assignment, :student, :url, :name, :status)
                ON CONFLICT (assignment_id, student_id) DO UPDATE
                SET file_url=EXCLUDED.file_url, file_name=EXCLUDED.file_name, submitted_at=NOW(), status=EXCLUDED.status
                """).param("assignment", id).param("student", user.id()).param("url", stored.url())
                .param("name", stored.name())
                .param("status", OffsetDateTime.now().isAfter(assignment.deadline()) ? "LATE" : "SUBMITTED").update();
        return submission(id, user.id());
    }

    @GetMapping("/{id}/submissions")
    public List<SubmissionView> submissions(@PathVariable Long id, Authentication authentication) {
        var course = jdbc.sql("SELECT course_id FROM assignments WHERE id=:id").param("id", id).query(Long.class).single();
        access.requireManage(course, currentUser.require(authentication));
        return jdbc.sql("""
                SELECT s.id, s.assignment_id, s.student_id, u.full_name AS student_name, s.file_url, s.file_name,
                       s.status, s.submitted_at, s.mark, s.feedback
                FROM assignment_submissions s JOIN users u ON u.id=s.student_id
                WHERE s.assignment_id=:id ORDER BY s.submitted_at DESC
                """).param("id", id).query(SubmissionView.class).list();
    }

    @PatchMapping("/submissions/{id}")
    public SubmissionView grade(@PathVariable Long id, @RequestBody GradeRequest request, Authentication authentication) {
        var meta = jdbc.sql("""
                SELECT a.course_id, s.assignment_id, s.student_id FROM assignment_submissions s
                JOIN assignments a ON a.id=s.assignment_id WHERE s.id=:id
                """).param("id", id).query(SubmissionMeta.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Submission not found"));
        access.requireManage(meta.courseId(), currentUser.require(authentication));
        jdbc.sql("UPDATE assignment_submissions SET mark=:mark, feedback=:feedback, status='GRADED' WHERE id=:id")
                .param("mark", request.mark()).param("feedback", request.feedback()).param("id", id).update();
        return submission(meta.assignmentId(), meta.studentId());
    }

    private AssignmentView get(Long id, Long userId) {
        return jdbc.sql("""
                SELECT a.id, a.course_id, a.title, a.description, a.deadline, a.attachment_url, a.created_at,
                       s.status AS submission_status, s.mark, s.feedback
                FROM assignments a LEFT JOIN assignment_submissions s ON s.assignment_id=a.id AND s.student_id=:user
                WHERE a.id=:id
                """).param("id", id).param("user", userId).query(AssignmentView.class).single();
    }

    private SubmissionView submission(Long assignmentId, Long studentId) {
        return jdbc.sql("""
                SELECT s.id, s.assignment_id, s.student_id, u.full_name AS student_name, s.file_url, s.file_name,
                       s.status, s.submitted_at, s.mark, s.feedback
                FROM assignment_submissions s JOIN users u ON u.id=s.student_id
                WHERE s.assignment_id=:assignment AND s.student_id=:student
                """).param("assignment", assignmentId).param("student", studentId).query(SubmissionView.class).single();
    }

    public record AssignmentRequest(Long courseId, @NotBlank String title, String description, OffsetDateTime deadline,
                                    String attachmentUrl) {}
    public record AssignmentView(Long id, Long courseId, String title, String description, OffsetDateTime deadline,
                                 String attachmentUrl, OffsetDateTime createdAt, String submissionStatus,
                                 Integer mark, String feedback) {}
    public record GradeRequest(Integer mark, String feedback) {}
    public record SubmissionView(Long id, Long assignmentId, Long studentId, String studentName, String fileUrl,
                                 String fileName, String status, OffsetDateTime submittedAt, Integer mark, String feedback) {}
    private record AssignmentMeta(Long courseId, OffsetDateTime deadline) {}
    private record SubmissionMeta(Long courseId, Long assignmentId, Long studentId) {}
}
