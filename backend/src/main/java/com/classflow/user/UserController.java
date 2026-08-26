package com.classflow.user;

import com.classflow.common.ActivityLog;
import com.classflow.common.ApiException;
import com.classflow.common.FileStorage;
import com.classflow.common.PageResponse;
import com.classflow.security.AuthCookies;
import com.classflow.security.CurrentUser;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private static final long MAX_AVATAR_BYTES = 5L * 1024 * 1024;

    private final JdbcClient jdbc;
    private final PasswordEncoder passwords;
    private final CurrentUser currentUser;
    private final FileStorage files;
    private final ActivityLog activity;
    private final AuthCookies cookies;
    private final UserRepository principals;

    public UserController(JdbcClient jdbc, PasswordEncoder passwords, CurrentUser currentUser, FileStorage files,
                          ActivityLog activity, AuthCookies cookies, UserRepository principals) {
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.currentUser = currentUser;
        this.files = files;
        this.activity = activity;
        this.cookies = cookies;
        this.principals = principals;
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public PageResponse<UserView> list(@RequestParam(required = false) String role,
                                       @RequestParam(required = false) String q,
                                       @RequestParam(defaultValue = "0") int page,
                                       @RequestParam(defaultValue = "20") int size) {
        size = Math.min(Math.max(size, 1), 100);
        page = Math.max(page, 0);
        var filter = role == null || role.isBlank() ? "%" : role.toUpperCase(Locale.ROOT);
        // Wrapped here rather than in SQL so an absent search stays a plain "%" match.
        var search = q == null || q.isBlank() ? "%" : "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
        var where = """
                WHERE role LIKE :role
                  AND (LOWER(full_name) LIKE :q OR LOWER(email) LIKE :q OR LOWER(COALESCE(phone,'')) LIKE :q)
                """;
        var items = jdbc.sql("""
                SELECT id, email, full_name, role, phone, bio, avatar_url, active, created_at
                FROM users %s ORDER BY created_at DESC LIMIT :size OFFSET :offset
                """.formatted(where))
                .param("role", filter).param("q", search)
                .param("size", size).param("offset", page * size)
                .query(UserView.class).list();
        var total = jdbc.sql("SELECT COUNT(*) FROM users " + where)
                .param("role", filter).param("q", search).query(Long.class).single();
        return new PageResponse<>(items, total, page, size);
    }

    @GetMapping("/me")
    public UserView me(Authentication authentication) {
        return get(currentUser.require(authentication).id());
    }

    /** Everything the admin dashboard's user popup shows, including what would block a delete. */
    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public UserDetail detail(@PathVariable Long id) {
        var row = jdbc.sql("""
                SELECT u.id, u.email, u.full_name, u.role, u.phone, u.bio, u.avatar_url, u.active, u.created_at,
                       (SELECT COUNT(*) FROM courses c WHERE c.teacher_id=u.id) AS courses_teaching,
                       (SELECT COUNT(*) FROM course_enrollments e
                          WHERE e.student_id=u.id AND e.status='APPROVED') AS courses_enrolled,
                       (SELECT COUNT(*) FROM materials m WHERE m.created_by=u.id) AS materials_created,
                       (SELECT COUNT(*) FROM assignments a WHERE a.created_by=u.id) AS assignments_created,
                       (SELECT COUNT(*) FROM assignment_submissions s WHERE s.student_id=u.id) AS submissions,
                       (SELECT COUNT(*) FROM quizzes q WHERE q.created_by=u.id) AS quizzes_created,
                       (SELECT COUNT(*) FROM quiz_attempts qa
                          WHERE qa.student_id=u.id AND qa.submitted_at IS NOT NULL) AS quiz_attempts,
                       (SELECT COUNT(*) FROM forum_topics t WHERE t.created_by=u.id)
                         + (SELECT COUNT(*) FROM forum_posts p WHERE p.created_by=u.id) AS forum_activity,
                       (SELECT COUNT(*) FROM chat_messages cm WHERE cm.sender_id=u.id) AS messages_sent,
                       (SELECT COUNT(*) FROM chat_messages cm WHERE cm.recipient_id=u.id) AS messages_received,
                       (SELECT COUNT(DISTINCT other) FROM (
                            SELECT recipient_id AS other FROM chat_messages WHERE sender_id=u.id
                            UNION SELECT sender_id FROM chat_messages WHERE recipient_id=u.id
                        ) partners) AS chat_partners
                FROM users u WHERE u.id=:id
                """).param("id", id).query(DetailRow.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
        return new UserDetail(row.id(), row.email(), row.fullName(), row.role(), row.phone(), row.bio(),
                row.avatarUrl(), row.active(), row.createdAt(), row.coursesTeaching(), row.coursesEnrolled(),
                row.materialsCreated(), row.assignmentsCreated(), row.submissions(), row.quizzesCreated(),
                row.quizAttempts(), row.forumActivity(), row.messagesSent(), row.messagesReceived(),
                row.chatPartners(), courses(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    public UserView create(@Valid @RequestBody CreateUser request, Authentication authentication) {
        // Stored lowercase to match self-service sign-up, so the same person cannot end up
        // with two rows that differ only in the casing of their address.
        var email = request.email().trim().toLowerCase(Locale.ROOT);
        var fullName = request.fullName().trim();
        if (jdbc.sql("SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(email)=:email)")
                .param("email", email).query(Boolean.class).single()) {
            throw new ApiException(HttpStatus.CONFLICT, "Email is already registered");
        }
        var id = jdbc.sql("""
                INSERT INTO users(email, password_hash, full_name, role, phone)
                VALUES (:email, :password, :name, :role, :phone) RETURNING id
                """).param("email", email).param("password", passwords.encode(request.password()))
                .param("name", fullName).param("role", request.role()).param("phone", request.phone())
                .query(Long.class).single();
        activity.record(currentUser.require(authentication).id(), "USER_CREATED",
                fullName + " (" + request.role() + ")");
        return get(id);
    }

    @PatchMapping("/me")
    public UserView updateMe(@Valid @RequestBody UpdateProfile request, Authentication authentication) {
        var user = currentUser.require(authentication);
        jdbc.sql("UPDATE users SET full_name=:name, phone=:phone, bio=:bio WHERE id=:id")
                .param("name", request.fullName()).param("phone", request.phone()).param("bio", request.bio())
                .param("id", user.id()).update();
        return get(user.id());
    }

    /** Replaces the signed-in user's profile picture. */
    @PostMapping(value = "/me/avatar", consumes = "multipart/form-data")
    public UserView uploadAvatar(@RequestPart MultipartFile file, Authentication authentication) {
        var user = currentUser.require(authentication);
        var type = file.getContentType();
        if (type == null || !type.toLowerCase(Locale.ROOT).startsWith("image/")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Choose an image file");
        }
        if (file.getSize() > MAX_AVATAR_BYTES) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Images must be 5 MB or smaller");
        }
        var previous = get(user.id()).avatarUrl();
        var stored = files.save(file, "avatars");
        jdbc.sql("UPDATE users SET avatar_url=:url WHERE id=:id")
                .param("url", stored.url()).param("id", user.id()).update();
        // Only once the new picture is recorded, so a failed update cannot lose both.
        files.delete(previous);
        return get(user.id());
    }

    @DeleteMapping("/me/avatar")
    public UserView removeAvatar(Authentication authentication) {
        var user = currentUser.require(authentication);
        var previous = get(user.id()).avatarUrl();
        jdbc.sql("UPDATE users SET avatar_url=NULL WHERE id=:id").param("id", user.id()).update();
        // delete() ignores a null or already-missing file, so this stays idempotent.
        files.delete(previous);
        return get(user.id());
    }

    /**
     * Changes your own password. The current one has to be supplied: an unattended browser
     * should not be enough to take an account over permanently.
     *
     * Every session for the account is invalidated, so a fresh cookie is issued here to keep
     * the person who just changed it signed in.
     */
    @PatchMapping("/me/password")
    public UserView changeMyPassword(@Valid @RequestBody ChangePassword request, Authentication authentication,
                                     HttpServletResponse response) {
        var user = currentUser.require(authentication);
        if (!passwords.matches(request.currentPassword(), user.password())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "That is not your current password");
        }
        if (passwords.matches(request.newPassword(), user.password())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Choose a password you have not used here before");
        }
        setPassword(user.id(), request.newPassword());
        activity.record(user.id(), "PASSWORD_CHANGED", user.fullName());
        // Re-read so the new password_changed_at reaches the token this issues.
        cookies.issue(principals.require(user.id()), response);
        return get(user.id());
    }

    /**
     * Sets a new password for someone else. This is the only way back into an account whose
     * password is lost: hashes are one-way, so nothing can recover the original.
     *
     * Resetting signs the account out everywhere, which is the point when the reset is
     * prompted by a suspected compromise rather than forgetfulness.
     */
    @PatchMapping("/{id}/password")
    @PreAuthorize("hasRole('ADMIN')")
    public UserView resetPassword(@PathVariable Long id, @Valid @RequestBody ResetPassword request,
                                  Authentication authentication) {
        var admin = currentUser.require(authentication);
        var target = get(id);
        if (admin.id().equals(id)) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "Change your own password from your profile, where the current one is required");
        }
        setPassword(id, request.newPassword());
        activity.record(admin.id(), "PASSWORD_RESET", target.fullName() + " (" + target.role() + ")");
        return get(id);
    }

    /**
     * The single place a password hash is written. Stamping password_changed_at in the same
     * statement is what makes tokens issued before this moment stop working.
     */
    private void setPassword(Long id, String rawPassword) {
        jdbc.sql("UPDATE users SET password_hash=:password, password_changed_at=NOW() WHERE id=:id")
                .param("password", passwords.encode(rawPassword)).param("id", id).update();
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    public UserView status(@PathVariable Long id, @RequestBody StatusRequest request, Authentication authentication) {
        var admin = currentUser.require(authentication);
        // JwtAuthenticationFilter rejects inactive users, so disabling yourself would sign
        // you out of the very account that can undo it.
        if (admin.id().equals(id) && !request.active()) {
            throw new ApiException(HttpStatus.CONFLICT, "You cannot disable your own account");
        }
        var target = get(id);
        if (!request.active() && "ADMIN".equals(target.role()) && lastEnabledAdmin(id)) {
            throw new ApiException(HttpStatus.CONFLICT, "This is the last active admin, so it cannot be disabled");
        }
        jdbc.sql("UPDATE users SET active=:active WHERE id=:id")
                .param("active", request.active()).param("id", id).update();
        activity.record(admin.id(), request.active() ? "USER_ENABLED" : "USER_DISABLED", target.fullName());
        return get(id);
    }

    /**
     * Changes what someone is allowed to do. The guards below stop the three changes that
     * would leave the platform in a state the UI cannot recover from: locking yourself out
     * of the admin role, removing the last admin, and demoting a teacher whose courses
     * would then be run by someone with no right to manage them.
     */
    @PatchMapping("/{id}/role")
    @PreAuthorize("hasRole('ADMIN')")
    public UserView role(@PathVariable Long id, @Valid @RequestBody RoleRequest request,
                         Authentication authentication) {
        var admin = currentUser.require(authentication);
        var role = request.role().toUpperCase(Locale.ROOT);
        var target = get(id);
        if (role.equals(target.role())) return target;
        if (admin.id().equals(id)) {
            throw new ApiException(HttpStatus.CONFLICT, "You cannot change your own role");
        }
        if ("ADMIN".equals(target.role()) && lastEnabledAdmin(id)) {
            throw new ApiException(HttpStatus.CONFLICT, "This is the last active admin, so the role cannot change");
        }
        if ("TEACHER".equals(target.role())) {
            var owned = jdbc.sql("SELECT COUNT(*) FROM courses WHERE teacher_id=:id").param("id", id)
                    .query(Long.class).single();
            if (owned > 0) {
                throw new ApiException(HttpStatus.CONFLICT, target.fullName() + " still runs " + owned + " course"
                        + (owned == 1 ? "" : "s") + ". Reassign " + (owned == 1 ? "it" : "them")
                        + " to another teacher first.");
            }
        }
        jdbc.sql("UPDATE users SET role=:role WHERE id=:id").param("role", role).param("id", id).update();
        activity.record(admin.id(), "USER_ROLE_CHANGED",
                target.fullName() + ": " + target.role() + " to " + role);
        return get(id);
    }

    /**
     * Removes the person along with the trail that is theirs alone: enrolments, submissions,
     * attempts, posts, messages and authored content all cascade (see V4__user_deletion.sql).
     * Courses deliberately do not, so a teacher who still runs one is refused rather than
     * taking the course, its students and their work down with them.
     *
     * The files those cascaded rows pointed at are collected first and removed from disk
     * once the delete has committed, so an account never leaves uploads behind.
     */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public void delete(@PathVariable Long id, Authentication authentication) {
        var admin = currentUser.require(authentication);
        if (admin.id().equals(id)) {
            throw new ApiException(HttpStatus.CONFLICT, "You cannot delete your own account");
        }
        var target = get(id);
        if ("ADMIN".equals(target.role()) && lastEnabledAdmin(id)) {
            throw new ApiException(HttpStatus.CONFLICT, "This is the last active admin, so it cannot be deleted");
        }
        var owned = jdbc.sql("SELECT COUNT(*) FROM courses WHERE teacher_id=:id")
                .param("id", id).query(Long.class).single();
        if (owned > 0) {
            throw new ApiException(HttpStatus.CONFLICT, target.fullName() + " still runs " + owned + " course"
                    + (owned == 1 ? "" : "s") + ". Reassign or remove " + (owned == 1 ? "it" : "them")
                    + " first, then delete the account.");
        }
        var storedFiles = jdbc.sql("""
                SELECT avatar_url FROM users WHERE id=:id AND avatar_url IS NOT NULL
                UNION ALL
                SELECT f.file_url FROM assignment_submission_files f
                JOIN assignment_submissions s ON s.id=f.submission_id WHERE s.student_id=:id
                UNION ALL
                SELECT url FROM materials WHERE created_by=:id AND type='FILE'
                UNION ALL
                SELECT attachment_url FROM assignments WHERE created_by=:id AND attachment_url IS NOT NULL
                UNION ALL
                -- Chat cascades on both sides of a conversation, so a message this person
                -- received is deleted too and its attachment has to go with it.
                SELECT attachment_url FROM chat_messages
                WHERE (sender_id=:id OR recipient_id=:id) AND attachment_url IS NOT NULL
                """).param("id", id).query(String.class).list();
        jdbc.sql("DELETE FROM users WHERE id=:id").param("id", id).update();
        files.deleteAll(storedFiles);
        activity.record(admin.id(), "USER_DELETED", target.fullName() + " (" + target.role() + ")");
    }

    /** True when disabling or deleting this account would leave no enabled admin behind. */
    private boolean lastEnabledAdmin(Long id) {
        return !jdbc.sql("SELECT EXISTS(SELECT 1 FROM users WHERE role='ADMIN' AND active AND id<>:id)")
                .param("id", id).query(Boolean.class).single();
    }

    private List<CourseLink> courses(Long id) {
        return jdbc.sql("""
                SELECT c.id, c.code, c.title, 'TEACHING' AS relation FROM courses c WHERE c.teacher_id=:id
                UNION ALL
                SELECT c.id, c.code, c.title, 'ENROLLED' AS relation FROM courses c
                  JOIN course_enrollments e ON e.course_id=c.id
                  WHERE e.student_id=:id AND e.status='APPROVED'
                ORDER BY relation, code
                """).param("id", id).query(CourseLink.class).list();
    }

    private UserView get(Long id) {
        return jdbc.sql("""
                SELECT id, email, full_name, role, phone, bio, avatar_url, active, created_at FROM users WHERE id=:id
                """).param("id", id).query(UserView.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
    }

    public record UserView(Long id, String email, String fullName, String role, String phone, String bio,
                           String avatarUrl, boolean active, OffsetDateTime createdAt) {}

    public record CourseLink(Long id, String code, String title, String relation) {}

    /**
     * The detail query's result set, one component per selected column so the row mapper
     * has an exact match. UserDetail adds the course list, which comes from a second query.
     */
    private record DetailRow(Long id, String email, String fullName, String role, String phone, String bio,
                             String avatarUrl, boolean active, OffsetDateTime createdAt,
                             long coursesTeaching, long coursesEnrolled, long materialsCreated,
                             long assignmentsCreated, long submissions, long quizzesCreated, long quizAttempts,
                             long forumActivity, long messagesSent, long messagesReceived, long chatPartners) {}

    public record UserDetail(Long id, String email, String fullName, String role, String phone, String bio,
                             String avatarUrl, boolean active, OffsetDateTime createdAt,
                             long coursesTeaching, long coursesEnrolled, long materialsCreated,
                             long assignmentsCreated, long submissions, long quizzesCreated, long quizAttempts,
                             long forumActivity, long messagesSent, long messagesReceived, long chatPartners,
                             List<CourseLink> courses) {}

    public record CreateUser(@Email String email, @Size(min = 8) String password, @NotBlank String fullName,
                             @Pattern(regexp = "ADMIN|TEACHER|STUDENT") String role, String phone) {}
    public record UpdateProfile(@NotBlank String fullName, String phone, String bio) {}
    public record ChangePassword(@NotBlank(message = "Enter your current password") String currentPassword,
                                @Size(min = 8, message = "New password must be at least 8 characters")
                                String newPassword) {}
    public record ResetPassword(@Size(min = 8, message = "Password must be at least 8 characters")
                                String newPassword) {}
    public record RoleRequest(@Pattern(regexp = "(?i)ADMIN|TEACHER|STUDENT",
                                       message = "Role must be ADMIN, TEACHER or STUDENT") String role) {}
    public record StatusRequest(boolean active) {}
}
