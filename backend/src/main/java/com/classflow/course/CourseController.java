package com.classflow.course;

import com.classflow.common.ActivityLog;
import com.classflow.common.ApiException;
import com.classflow.common.CourseAccess;
import com.classflow.common.FileStorage;
import com.classflow.common.PageResponse;
import com.classflow.notification.NotificationService;
import com.classflow.security.CurrentUser;
import com.classflow.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/courses")
public class CourseController {
    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final CourseAccess access;
    private final ActivityLog activity;
    private final FileStorage files;
    private final NotificationService notifications;

    public CourseController(JdbcClient jdbc, CurrentUser currentUser, CourseAccess access, ActivityLog activity,
                            FileStorage files, NotificationService notifications) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.access = access;
        this.activity = activity;
        this.files = files;
        this.notifications = notifications;
    }

    /**
     * The caller's courses. For a student, {@code scope=available} switches from the courses
     * they are enrolled in to the catalogue of ones they could join, which is the only way
     * an unenrolled student sees a course exists at all.
     */
    @GetMapping
    public PageResponse<CourseView> list(Authentication authentication,
                                         @RequestParam(defaultValue = "enrolled") String scope,
                                         @RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "20") int size) {
        var user = currentUser.require(authentication);
        size = Math.min(Math.max(size, 1), 100);
        page = Math.max(page, 0);
        var condition = listCondition(user.role(), scope);
        var sql = """
                SELECT c.id, c.title, c.code, c.description, c.subject, c.active, c.teacher_id,
                       u.full_name AS teacher_name, c.created_at,
                       (SELECT COUNT(*) FROM course_enrollments e
                        WHERE e.course_id=c.id AND e.status='APPROVED') AS student_count
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

    /**
     * Builds the WHERE clause for {@link #list}. Archived courses drop out of the teaching
     * and learning surfaces entirely; only an admin still sees them, because only an admin
     * can restore or delete one.
     */
    private String listCondition(String role, String scope) {
        return switch (role) {
            case "TEACHER" -> "WHERE c.active AND c.teacher_id = :user";
            case "STUDENT" -> "available".equalsIgnoreCase(scope) ? """
                    WHERE c.active AND NOT EXISTS (
                        SELECT 1 FROM course_enrollments e
                        WHERE e.course_id=c.id AND e.student_id = :user AND e.status = 'APPROVED')"""
                    : """
                    JOIN course_enrollments mine ON mine.course_id=c.id
                    WHERE c.active AND mine.student_id = :user AND mine.status = 'APPROVED'""";
            // An admin's list is the whole catalogue either way, so scope does not apply.
            default -> "";
        };
    }

    @GetMapping("/{id}")
    public CourseView get(@PathVariable Long id, Authentication authentication) {
        access.requireView(id, currentUser.require(authentication));
        return require(id);
    }

    /**
     * A student asking to join a course. The request waits as PENDING until the teacher
     * decides; approval is what turns on the materials, assignments, quizzes, forum and the
     * ability to message the teacher, and CourseAccess.requireView refuses all of it before.
     *
     * Re-requesting after a rejection is allowed and moves the row back to PENDING, so a
     * decision made in error does not lock a student out permanently. Asking again while
     * already pending changes nothing, which keeps a double tap harmless.
     */
    @PostMapping("/{id}/enroll")
    @ResponseStatus(HttpStatus.CREATED)
    public EnrollmentStatusView enroll(@PathVariable Long id, Authentication authentication) {
        var user = currentUser.require(authentication);
        if (!"STUDENT".equals(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Only students can request to join a course");
        }
        var course = require(id);
        if (!course.active()) {
            throw new ApiException(HttpStatus.CONFLICT, "This course is archived and is not taking new students");
        }
        var existing = statusOf(id, user.id());
        if ("APPROVED".equals(existing)) {
            throw new ApiException(HttpStatus.CONFLICT, "You are already enrolled on this course");
        }
        if (!"PENDING".equals(existing)) {
            jdbc.sql("""
                    INSERT INTO course_enrollments(course_id, student_id, status)
                    VALUES (:course, :student, 'PENDING')
                    ON CONFLICT (course_id, student_id)
                    DO UPDATE SET status='PENDING', enrolled_at=NOW(), decided_at=NULL, decided_by=NULL
                    """).param("course", id).param("student", user.id()).update();
            activity.record(user.id(), "ENROLLMENT_REQUESTED", course.code() + " " + course.title());
            notifications.notifyCourseTeacher(id, user.id(), "ENROLLMENT_REQUESTED",
                    user.fullName() + " wants to join " + course.code(),
                    "Approve or decline the request", "courses/" + id);
        }
        return new EnrollmentStatusView(id, "PENDING");
    }

    /** Lets a student take back a request the teacher has not answered yet. */
    @DeleteMapping("/{id}/enroll")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void withdraw(@PathVariable Long id, Authentication authentication) {
        var user = currentUser.require(authentication);
        var removed = jdbc.sql("""
                DELETE FROM course_enrollments
                WHERE course_id=:course AND student_id=:student AND status='PENDING'
                """).param("course", id).param("student", user.id()).update();
        if (removed == 0) {
            throw new ApiException(HttpStatus.CONFLICT, "There is no pending request to withdraw");
        }
    }

    /**
     * The signed-in student's request state for every course they have asked about, so the
     * catalogue can show "Pending" or "Declined" instead of offering Join again.
     */
    @GetMapping("/enrollments/mine")
    public List<EnrollmentStatusView> myEnrollments(Authentication authentication) {
        var user = currentUser.require(authentication);
        return jdbc.sql("""
                SELECT course_id, status FROM course_enrollments WHERE student_id=:student
                """).param("student", user.id()).query(EnrollmentStatusView.class).list();
    }

    /** Requests waiting on this course's teacher, oldest first so nobody is left behind. */
    @GetMapping("/{id}/enrollment-requests")
    public List<EnrollmentRequestView> requests(@PathVariable Long id, Authentication authentication) {
        access.requireManage(id, currentUser.require(authentication));
        return jdbc.sql("""
                SELECT e.student_id, u.full_name AS student_name, u.email, u.avatar_url, e.enrolled_at AS requested_at
                FROM course_enrollments e JOIN users u ON u.id=e.student_id
                WHERE e.course_id=:course AND e.status='PENDING' AND u.active
                ORDER BY e.enrolled_at
                """).param("course", id).query(EnrollmentRequestView.class).list();
    }

    /**
     * The teacher's decision on one request. Approving is the moment the student gains the
     * course; rejecting keeps the row so they can be told, rather than silently vanishing.
     */
    @PatchMapping("/{id}/enrollment-requests/{studentId}")
    public EnrollmentStatusView decide(@PathVariable Long id, @PathVariable Long studentId,
                                       @RequestBody DecisionRequest request, Authentication authentication) {
        var user = currentUser.require(authentication);
        access.requireManage(id, user);
        var decision = request.approve() ? "APPROVED" : "REJECTED";
        var updated = jdbc.sql("""
                UPDATE course_enrollments SET status=:status, decided_at=NOW(), decided_by=:decider
                WHERE course_id=:course AND student_id=:student AND status='PENDING'
                """).param("status", decision).param("decider", user.id())
                .param("course", id).param("student", studentId).update();
        if (updated == 0) {
            throw new ApiException(HttpStatus.CONFLICT, "That request has already been answered");
        }
        var course = require(id);
        var studentName = jdbc.sql("SELECT full_name FROM users WHERE id=:id")
                .param("id", studentId).query(String.class).single();
        activity.record(user.id(), request.approve() ? "ENROLLMENT_APPROVED" : "ENROLLMENT_REJECTED",
                studentName + " - " + course.code());
        notifications.notifyUser(studentId, request.approve() ? "ENROLLMENT_APPROVED" : "ENROLLMENT_REJECTED",
                request.approve() ? "You joined " + course.code() : "Request declined for " + course.code(),
                request.approve()
                        ? "Materials, assignments, quizzes and the forum are now open to you"
                        : "Ask the teacher if you think this was a mistake",
                request.approve() ? "courses/" + id : "courses");
        return new EnrollmentStatusView(id, decision);
    }

    /** Null when the student has never asked about this course. */
    private String statusOf(Long courseId, Long studentId) {
        return jdbc.sql("""
                SELECT status FROM course_enrollments WHERE course_id=:course AND student_id=:student
                """).param("course", courseId).param("student", studentId)
                .query(String.class).optional().orElse(null);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CourseView create(@Valid @RequestBody CourseRequest request, Authentication authentication) {
        var user = currentUser.require(authentication);
        if (!List.of("ADMIN", "TEACHER").contains(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Only teachers can create courses");
        }
        var teacherId = resolveTeacher(request.teacherId(), user);
        var id = jdbc.sql("""
                INSERT INTO courses(title, code, description, subject, teacher_id)
                VALUES (:title, :code, :description, :subject, :teacher) RETURNING id
                """).param("title", request.title()).param("code", request.code().toUpperCase())
                .param("description", request.description()).param("subject", request.subject())
                .param("teacher", teacherId).query(Long.class).single();
        activity.record(user.id(), "COURSE_CREATED", request.code().toUpperCase() + " " + request.title());
        notifications.notifyAdmins(user.id(), "COURSE_CREATED",
                "New course: " + request.code().toUpperCase(), request.title(), "courses");
        return require(id);
    }

    /**
     * Edits course details. A teacher may reword their own course; only an admin may hand it
     * to a different teacher, which is how a course outlives the person who used to run it.
     */
    @PatchMapping("/{id}")
    public CourseView update(@PathVariable Long id, @Valid @RequestBody CourseUpdateRequest request,
                             Authentication authentication) {
        var user = currentUser.require(authentication);
        access.requireManage(id, user);
        var current = require(id);
        var teacherId = current.teacherId();
        if (request.teacherId() != null && !request.teacherId().equals(teacherId)) {
            if (!"ADMIN".equals(user.role())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Only an admin can reassign a course to another teacher");
            }
            teacherId = requireActiveTeacher(request.teacherId());
        }
        jdbc.sql("""
                UPDATE courses SET title=:title, description=:description, subject=:subject, teacher_id=:teacher
                WHERE id=:id
                """).param("title", request.title().trim()).param("description", text(request.description()))
                .param("subject", request.subject().trim()).param("teacher", teacherId).param("id", id).update();
        if (!teacherId.equals(current.teacherId())) {
            activity.record(user.id(), "COURSE_REASSIGNED", current.code() + " to " + require(id).teacherName());
        }
        return require(id);
    }

    /**
     * Archives or restores a course. Archiving is the reversible alternative to deleting:
     * the course and every piece of work in it survive, but it leaves the teacher's and
     * students' workspaces and stops accepting new content.
     */
    @PatchMapping("/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    public CourseView status(@PathVariable Long id, @RequestBody StatusRequest request,
                             Authentication authentication) {
        var user = currentUser.require(authentication);
        var course = require(id);
        jdbc.sql("UPDATE courses SET active=:active WHERE id=:id")
                .param("active", request.active()).param("id", id).update();
        activity.record(user.id(), request.active() ? "COURSE_RESTORED" : "COURSE_ARCHIVED", course.code());
        return require(id);
    }

    /** What a delete would destroy, so the admin confirms against real numbers rather than a guess. */
    @GetMapping("/{id}/impact")
    @PreAuthorize("hasRole('ADMIN')")
    public DeletionImpact impact(@PathVariable Long id) {
        require(id);
        return jdbc.sql("""
                SELECT (SELECT COUNT(*) FROM course_enrollments
                          WHERE course_id=:id AND status='APPROVED') AS students,
                       (SELECT COUNT(*) FROM lessons WHERE course_id=:id) AS lessons,
                       (SELECT COUNT(*) FROM materials WHERE course_id=:id) AS materials,
                       (SELECT COUNT(*) FROM assignments WHERE course_id=:id) AS assignments,
                       (SELECT COUNT(*) FROM assignment_submissions s
                          JOIN assignments a ON a.id=s.assignment_id WHERE a.course_id=:id) AS submissions,
                       (SELECT COUNT(*) FROM quizzes WHERE course_id=:id) AS quizzes,
                       (SELECT COUNT(*) FROM quiz_attempts qa
                          JOIN quizzes q ON q.id=qa.quiz_id WHERE q.course_id=:id) AS quiz_attempts,
                       (SELECT COUNT(*) FROM forum_topics WHERE course_id=:id) AS forum_topics
                """).param("id", id).query(DeletionImpact.class).single();
    }

    /**
     * Permanently removes a course and everything inside it. Every child table cascades from
     * courses(id), so this deletes lessons, materials, assignments and their submissions,
     * quizzes and their attempts, forum threads and enrolments in one statement. The files
     * those rows pointed at are collected first and removed after the transaction commits.
     */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public void delete(@PathVariable Long id, Authentication authentication) {
        var user = currentUser.require(authentication);
        var course = require(id);
        var storedFiles = jdbc.sql("""
                SELECT url FROM materials WHERE course_id=:id AND type='FILE'
                UNION ALL
                SELECT attachment_url FROM assignments WHERE course_id=:id AND attachment_url IS NOT NULL
                UNION ALL
                SELECT f.file_url FROM assignment_submission_files f
                  JOIN assignment_submissions s ON s.id=f.submission_id
                  JOIN assignments a ON a.id=s.assignment_id WHERE a.course_id=:id
                """).param("id", id).query(String.class).list();
        jdbc.sql("DELETE FROM courses WHERE id=:id").param("id", id).update();
        files.deleteAll(storedFiles);
        activity.record(user.id(), "COURSE_DELETED", course.code() + " " + course.title());
    }

    @PostMapping("/{id}/enrollments")
    @ResponseStatus(HttpStatus.CREATED)
    public void enroll(@PathVariable Long id, @RequestBody EnrollmentRequest request, Authentication authentication) {
        var user = currentUser.require(authentication);
        access.requireManage(id, currentUser.require(authentication));
        var added = jdbc.sql("""
                INSERT INTO course_enrollments(course_id, student_id, status, decided_at, decided_by)
                VALUES (:course, :student, 'APPROVED', NOW(), :decider)
                ON CONFLICT (course_id, student_id)
                DO UPDATE SET status='APPROVED', decided_at=NOW(), decided_by=:decider
                WHERE course_enrollments.status <> 'APPROVED'
                """).param("course", id).param("student", request.studentId())
                .param("decider", user.id()).update();
        // The teacher adding someone is the approval, so this also answers any pending
        // request from that student. Only a real change is worth an activity entry.
        if (added > 0) activity.record(user.id(), "STUDENT_ENROLLED", require(id).code());
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
                """).param("course", id).param("title", request.title())
                .param("description", text(request.description()))
                .param("position", request.position()).query(Long.class).single();
        return requireLesson(lessonId);
    }

    @PatchMapping("/{id}/lessons/{lessonId}")
    public LessonView updateLesson(@PathVariable Long id, @PathVariable Long lessonId,
                                   @Valid @RequestBody LessonUpdateRequest request,
                                   Authentication authentication) {
        access.requireManage(id, currentUser.require(authentication));
        // Matching on course_id as well stops a teacher editing a lesson that
        // belongs to a course they do not manage by passing its id here.
        var updated = jdbc.sql("""
                UPDATE lessons SET title=:title, description=:description
                WHERE id=:lesson AND course_id=:course
                """).param("title", request.title()).param("description", text(request.description()))
                .param("lesson", lessonId).param("course", id).update();
        if (updated == 0) throw new ApiException(HttpStatus.NOT_FOUND, "Lesson not found in this course");
        return requireLesson(lessonId);
    }

    @DeleteMapping("/{id}/lessons/{lessonId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteLesson(@PathVariable Long id, @PathVariable Long lessonId, Authentication authentication) {
        access.requireManage(id, currentUser.require(authentication));
        var deleted = jdbc.sql("DELETE FROM lessons WHERE id=:lesson AND course_id=:course")
                .param("lesson", lessonId).param("course", id).update();
        if (deleted == 0) throw new ApiException(HttpStatus.NOT_FOUND, "Lesson not found in this course");
    }

    private LessonView requireLesson(Long lessonId) {
        return jdbc.sql("""
                SELECT id, course_id, title, description, position, created_at FROM lessons WHERE id=:id
                """).param("id", lessonId).query(LessonView.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Lesson not found"));
    }

    /** lessons.description is NOT NULL, so an omitted description becomes an empty string. */
    private String text(String value) {
        return value == null ? "" : value;
    }

    /**
     * A course is taught by a TEACHER, never by the admin who set it up. An admin therefore
     * has to name one: without this an admin-created course landed on the admin's own id,
     * which left it with an ADMIN "teacher" that no teacher could then manage.
     */
    private Long resolveTeacher(Long requested, UserPrincipal user) {
        if (!"ADMIN".equals(user.role())) return user.id();
        if (requested == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Choose the teacher who will run this course");
        }
        return requireActiveTeacher(requested);
    }

    /** Guards every path that sets teacher_id, so a course can never land on a non-teacher. */
    private Long requireActiveTeacher(Long id) {
        var teaches = jdbc.sql("SELECT EXISTS(SELECT 1 FROM users WHERE id=:id AND role='TEACHER' AND active)")
                .param("id", id).query(Boolean.class).single();
        if (!teaches) throw new ApiException(HttpStatus.BAD_REQUEST, "Pick an active teacher for this course");
        return id;
    }

    private CourseView require(Long id) {
        return jdbc.sql("""
                SELECT c.id, c.title, c.code, c.description, c.subject, c.active, c.teacher_id,
                       u.full_name AS teacher_name, c.created_at,
                       (SELECT COUNT(*) FROM course_enrollments e
                        WHERE e.course_id=c.id AND e.status='APPROVED') AS student_count
                FROM courses c JOIN users u ON u.id=c.teacher_id WHERE c.id=:id
                """).param("id", id).query(CourseView.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Course not found"));
    }

    public record CourseView(Long id, String title, String code, String description, String subject, boolean active,
                             Long teacherId, String teacherName, OffsetDateTime createdAt, long studentCount) {}
    public record CourseRequest(@NotBlank String title, @NotBlank String code, String description,
                                @NotBlank String subject, Long teacherId) {}
    public record CourseUpdateRequest(@NotBlank(message = "Course title is required") String title,
                                      String description,
                                      @NotBlank(message = "Subject is required") String subject,
                                      Long teacherId) {}
    public record StatusRequest(boolean active) {}
    public record DeletionImpact(long students, long lessons, long materials, long assignments, long submissions,
                                 long quizzes, long quizAttempts, long forumTopics) {}
    public record EnrollmentRequest(Long studentId) {}
    public record DecisionRequest(boolean approve) {}
    /** One course's state for the signed-in student: PENDING, APPROVED or REJECTED. */
    public record EnrollmentStatusView(Long courseId, String status) {}
    public record EnrollmentRequestView(Long studentId, String studentName, String email, String avatarUrl,
                                        OffsetDateTime requestedAt) {}
    public record LessonRequest(@NotBlank String title, String description, int position) {}
    public record LessonUpdateRequest(@NotBlank(message = "Lesson title is required") String title,
                                      String description) {}
    public record LessonView(Long id, Long courseId, String title, String description, int position,
                             OffsetDateTime createdAt) {}
}
