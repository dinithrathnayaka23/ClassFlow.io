package com.classflow.assignment;

import com.classflow.common.ApiException;
import com.classflow.common.CourseAccess;
import com.classflow.common.FileStorage;
import com.classflow.notification.NotificationService;
import com.classflow.security.CurrentUser;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.util.unit.DataSize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/assignments")
public class AssignmentController {
    /** Enough for a report and its parts, without letting a submission become a dumping ground. */
    private static final int MAX_FILES_PER_SUBMISSION = 10;

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final CourseAccess access;
    private final FileStorage files;
    private final DataSize maxFileSize;
    private final NotificationService notifications;

    public AssignmentController(JdbcClient jdbc, CurrentUser currentUser, CourseAccess access, FileStorage files,
                                NotificationService notifications,
                                @Value("${spring.servlet.multipart.max-file-size}") String maxFileSize) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.access = access;
        this.files = files;
        this.notifications = notifications;
        // Parsed rather than injected as DataSize so the binding does not depend on which
        // conversion service happens to be in play.
        this.maxFileSize = DataSize.parse(maxFileSize);
    }

    /**
     * What an upload is allowed to be, so the page can say so before someone picks a file
     * rather than after a long upload fails.
     *
     * Read from the same property the multipart parser enforces, so raising MAX_FILE_SIZE
     * moves the limit and the advertised figure together and the UI cannot come to lie.
     */
    @GetMapping("/limits")
    public UploadLimits limits() {
        return new UploadLimits(maxFileSize.toBytes(), MAX_FILES_PER_SUBMISSION);
    }

    @GetMapping
    public List<AssignmentView> list(@RequestParam Long courseId, Authentication authentication) {
        var user = currentUser.require(authentication);
        access.requireView(courseId, user);
        return jdbc.sql("""
                SELECT a.id, a.course_id, a.title, a.description, a.deadline, a.attachment_url, a.attachment_name, a.created_at,
                       s.status AS submission_status, s.mark, s.feedback,
                       s.id AS submission_id, s.submitted_at AS submitted_at
                FROM assignments a
                LEFT JOIN assignment_submissions s ON s.assignment_id=a.id AND s.student_id=:user
                WHERE a.course_id=:course ORDER BY a.deadline
                """).param("course", courseId).param("user", user.id()).query(AssignmentRow.class).list().stream()
                .map(row -> row.withFiles(filesOf(row.submissionId()))).toList();
    }

    /**
     * Briefs are uploaded files rather than external links, so this takes a multipart
     * form. The file is optional: an assignment can be text-only.
     */
    @PostMapping(consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    public AssignmentView create(@RequestParam Long courseId,
                                 @RequestParam String title,
                                 @RequestParam(required = false) String description,
                                 @RequestParam String deadline,
                                 @RequestPart(required = false) MultipartFile file,
                                 Authentication authentication) {
        var user = currentUser.require(authentication);
        access.requireManage(courseId, user);
        if (title == null || title.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Title is required");
        }
        OffsetDateTime due;
        try {
            due = OffsetDateTime.parse(deadline);
        } catch (DateTimeParseException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "A valid deadline is required");
        }

        String url = null;
        String name = null;
        if (file != null && !file.isEmpty()) {
            var stored = files.save(file, "assignments");
            url = stored.url();
            name = stored.name();
        }

        var id = jdbc.sql("""
                INSERT INTO assignments(course_id, title, description, deadline, attachment_url, attachment_name, created_by)
                VALUES (:course, :title, :description, :deadline, :url, :name, :user) RETURNING id
                """).param("course", courseId).param("title", title.trim())
                .param("description", description == null ? "" : description)
                .param("deadline", due).param("url", url).param("name", name)
                .param("user", user.id()).query(Long.class).single();
        notifications.notifyCourseStudents(courseId, user.id(), "ASSIGNMENT_POSTED",
                "New assignment: " + title.trim(), "Due " + due.toLocalDate(), "assignments");
        return get(id, user.id());
    }

    /**
     * Adds one or more files to this student's submission, creating it on the first upload.
     *
     * Uploading adds rather than replaces, so a report can be handed in now and its appendix
     * later without re-sending the first file; removing a file is a separate call. Once the
     * teacher has recorded a mark the work is settled and both are refused, rather than
     * quietly changing what was graded.
     */
    @PostMapping(value = "/{id}/submissions", consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public SubmissionView submit(@PathVariable Long id,
                                 @RequestPart("file") List<MultipartFile> file,
                                 Authentication authentication) {
        var user = currentUser.require(authentication);
        if (!"STUDENT".equals(user.role())) throw new ApiException(HttpStatus.FORBIDDEN, "Only students submit work");
        var chosen = file == null ? List.<MultipartFile>of() : file.stream().filter(one -> !one.isEmpty()).toList();
        if (chosen.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "Choose at least one file to submit");

        var assignment = jdbc.sql("SELECT course_id, deadline FROM assignments WHERE id=:id").param("id", id)
                .query(AssignmentMeta.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Assignment not found"));
        access.requireView(assignment.courseId(), user);
        requireChangeable(id, user.id());

        var already = countFiles(id, user.id());
        if (already + chosen.size() > MAX_FILES_PER_SUBMISSION) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "A submission can hold at most "
                    + MAX_FILES_PER_SUBMISSION + " files, and this one already has " + already + ".");
        }

        // The parent row carries status and timing; adding refreshes both, so a late addition
        // is marked LATE even when the first file arrived on time.
        var submissionId = jdbc.sql("""
                INSERT INTO assignment_submissions(assignment_id, student_id, status)
                VALUES (:assignment, :student, :status)
                ON CONFLICT (assignment_id, student_id) DO UPDATE
                SET submitted_at=NOW(), status=EXCLUDED.status
                RETURNING id
                """).param("assignment", id).param("student", user.id())
                .param("status", OffsetDateTime.now().isAfter(assignment.deadline()) ? "LATE" : "SUBMITTED")
                .query(Long.class).single();

        for (var upload : chosen) {
            var stored = files.save(upload, "submissions");
            jdbc.sql("""
                    INSERT INTO assignment_submission_files(submission_id, file_url, file_name, content_type, size_bytes)
                    VALUES (:submission, :url, :name, :type, :size)
                    """).param("submission", submissionId).param("url", stored.url()).param("name", stored.name())
                    .param("type", upload.getContentType()).param("size", upload.getSize()).update();
        }
        notifications.notifyCourseTeacher(assignment.courseId(), user.id(), "SUBMISSION_RECEIVED",
                user.fullName() + " submitted work",
                chosen.size() + (chosen.size() == 1 ? " file" : " files") + " to review", "submissions");
        return submission(id, user.id());
    }

    /** Removes one file from a submission, so a mistaken upload can be taken back. */
    @DeleteMapping("/submissions/{submissionId}/files/{fileId}")
    public SubmissionView removeFile(@PathVariable Long submissionId, @PathVariable Long fileId,
                                     Authentication authentication) {
        var user = currentUser.require(authentication);
        var meta = jdbc.sql("""
                SELECT a.course_id, s.assignment_id, s.student_id FROM assignment_submissions s
                JOIN assignments a ON a.id=s.assignment_id WHERE s.id=:id
                """).param("id", submissionId).query(SubmissionMeta.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Submission not found"));
        if (!meta.studentId().equals(user.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "You can only change your own submission");
        }
        requireChangeable(meta.assignmentId(), user.id());
        if (countFiles(meta.assignmentId(), user.id()) <= 1) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "A submission needs at least one file. Upload the replacement first, then remove this one.");
        }
        var url = jdbc.sql("""
                SELECT file_url FROM assignment_submission_files WHERE id=:file AND submission_id=:submission
                """).param("file", fileId).param("submission", submissionId).query(String.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "That file is not on this submission"));
        jdbc.sql("DELETE FROM assignment_submission_files WHERE id=:file").param("file", fileId).update();
        files.delete(url);
        return submission(meta.assignmentId(), user.id());
    }

    /** Graded work is settled: neither adding nor removing may change what was marked. */
    private void requireChangeable(Long assignmentId, Long studentId) {
        var status = jdbc.sql("""
                SELECT status FROM assignment_submissions WHERE assignment_id=:assignment AND student_id=:student
                """).param("assignment", assignmentId).param("student", studentId)
                .query(String.class).optional().orElse(null);
        if ("GRADED".equals(status)) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "This work has already been marked, so it can no longer be changed");
        }
    }

    private long countFiles(Long assignmentId, Long studentId) {
        return jdbc.sql("""
                SELECT COUNT(*) FROM assignment_submission_files f
                JOIN assignment_submissions s ON s.id=f.submission_id
                WHERE s.assignment_id=:assignment AND s.student_id=:student
                """).param("assignment", assignmentId).param("student", studentId).query(Long.class).single();
    }

    /**
     * Streams a submitted file to the student who uploaded it or to someone who manages the
     * course. Submissions are excluded from the public /uploads path so this check cannot be
     * sidestepped by anyone who happens to learn the stored filename.
     */
    @GetMapping("/submissions/files/{fileId}")
    public ResponseEntity<?> download(@PathVariable Long fileId, Authentication authentication) {
        var user = currentUser.require(authentication);
        var row = jdbc.sql("""
                SELECT f.file_url, f.file_name, s.student_id, a.course_id
                FROM assignment_submission_files f
                JOIN assignment_submissions s ON s.id=f.submission_id
                JOIN assignments a ON a.id=s.assignment_id
                WHERE f.id=:id
                """).param("id", fileId).query(SubmissionFile.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "File not found"));
        if (!row.studentId().equals(user.id())) access.requireManage(row.courseId(), user);

        var disposition = ContentDisposition.attachment()
                .filename(row.fileName(), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(files.read(row.fileUrl()));
    }

    @GetMapping("/{id}/submissions")
    public List<SubmissionView> submissions(@PathVariable Long id, Authentication authentication) {
        var course = jdbc.sql("SELECT course_id FROM assignments WHERE id=:id").param("id", id).query(Long.class).single();
        access.requireManage(course, currentUser.require(authentication));
        return jdbc.sql("""
                SELECT s.id, s.assignment_id, s.student_id, u.full_name AS student_name,
                       s.status, s.submitted_at, s.mark, s.feedback
                FROM assignment_submissions s JOIN users u ON u.id=s.student_id
                WHERE s.assignment_id=:id ORDER BY s.submitted_at DESC
                """).param("id", id).query(SubmissionRow.class).list().stream()
                .map(row -> row.withFiles(filesOf(row.id()))).toList();
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
        notifications.notifyUser(meta.studentId(), "WORK_GRADED", "Your work has been marked",
                request.mark() == null ? "See the feedback on your assignment" : request.mark() + " marks",
                "assignments");
        return submission(meta.assignmentId(), meta.studentId());
    }

    private AssignmentView get(Long id, Long userId) {
        var row = jdbc.sql("""
                SELECT a.id, a.course_id, a.title, a.description, a.deadline, a.attachment_url, a.attachment_name, a.created_at,
                       s.status AS submission_status, s.mark, s.feedback,
                       s.id AS submission_id, s.submitted_at AS submitted_at
                FROM assignments a LEFT JOIN assignment_submissions s ON s.assignment_id=a.id AND s.student_id=:user
                WHERE a.id=:id
                """).param("id", id).param("user", userId).query(AssignmentRow.class).single();
        return row.withFiles(filesOf(row.submissionId()));
    }

    /** The files on one submission, newest last so the list reads in upload order. */
    private List<SubmissionFileView> filesOf(Long submissionId) {
        if (submissionId == null) return List.of();
        return jdbc.sql("""
                SELECT id, file_name, content_type, size_bytes, uploaded_at
                FROM assignment_submission_files WHERE submission_id=:id ORDER BY uploaded_at, id
                """).param("id", submissionId).query(SubmissionFileView.class).list();
    }

    private Long submissionIdOf(Long assignmentId, Long studentId) {
        return jdbc.sql("""
                SELECT id FROM assignment_submissions WHERE assignment_id=:assignment AND student_id=:student
                """).param("assignment", assignmentId).param("student", studentId)
                .query(Long.class).optional().orElse(null);
    }

    private SubmissionView submission(Long assignmentId, Long studentId) {
        return jdbc.sql("""
                SELECT s.id, s.assignment_id, s.student_id, u.full_name AS student_name,
                       s.status, s.submitted_at, s.mark, s.feedback
                FROM assignment_submissions s JOIN users u ON u.id=s.student_id
                WHERE s.assignment_id=:assignment AND s.student_id=:student
                """).param("assignment", assignmentId).param("student", studentId)
                .query(SubmissionRow.class).single().withFiles(filesOf(submissionIdOf(assignmentId, studentId)));
    }

    public record AssignmentView(Long id, Long courseId, String title, String description, OffsetDateTime deadline,
                                 String attachmentUrl, String attachmentName, OffsetDateTime createdAt,
                                 String submissionStatus, Integer mark, String feedback,
                                 Long submissionId, OffsetDateTime submittedAt,
                                 List<SubmissionFileView> submissionFiles) {
        AssignmentView withFiles(List<SubmissionFileView> uploaded) {
            return new AssignmentView(id, courseId, title, description, deadline, attachmentUrl, attachmentName,
                    createdAt, submissionStatus, mark, feedback, submissionId, submittedAt, uploaded);
        }
    }

    /** The assignment query's own columns; AssignmentView adds the files from a second query. */
    private record AssignmentRow(Long id, Long courseId, String title, String description, OffsetDateTime deadline,
                                 String attachmentUrl, String attachmentName, OffsetDateTime createdAt,
                                 String submissionStatus, Integer mark, String feedback,
                                 Long submissionId, OffsetDateTime submittedAt) {
        AssignmentView withFiles(List<SubmissionFileView> uploaded) {
            return new AssignmentView(id, courseId, title, description, deadline, attachmentUrl, attachmentName,
                    createdAt, submissionStatus, mark, feedback, submissionId, submittedAt, uploaded);
        }
    }

    public record SubmissionFileView(Long id, String fileName, String contentType, Long sizeBytes,
                                     OffsetDateTime uploadedAt) {}
    public record GradeRequest(Integer mark, String feedback) {}
    public record SubmissionView(Long id, Long assignmentId, Long studentId, String studentName,
                                 String status, OffsetDateTime submittedAt, Integer mark, String feedback,
                                 List<SubmissionFileView> files) {}

    /** The submission query's own columns, before its files are attached. */
    private record SubmissionRow(Long id, Long assignmentId, Long studentId, String studentName,
                                 String status, OffsetDateTime submittedAt, Integer mark, String feedback) {
        SubmissionView withFiles(List<SubmissionFileView> uploaded) {
            return new SubmissionView(id, assignmentId, studentId, studentName, status, submittedAt, mark,
                    feedback, uploaded);
        }
    }
    /** Advertised upload allowance: bytes per file, and how many files one submission holds. */
    public record UploadLimits(long maxFileBytes, int maxFilesPerSubmission) {}

    private record AssignmentMeta(Long courseId, OffsetDateTime deadline) {}
    private record SubmissionFile(String fileUrl, String fileName, Long studentId, Long courseId) {}
    private record SubmissionMeta(Long courseId, Long assignmentId, Long studentId) {}
}
