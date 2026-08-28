package com.classflow.material;

import com.classflow.common.ApiException;
import com.classflow.common.CourseAccess;
import com.classflow.common.FileStorage;
import com.classflow.notification.NotificationService;
import com.classflow.security.CurrentUser;
import jakarta.validation.constraints.NotBlank;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/materials")
public class MaterialController {
    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final CourseAccess access;
    private final FileStorage files;
    private final NotificationService notifications;

    public MaterialController(JdbcClient jdbc, CurrentUser currentUser, CourseAccess access, FileStorage files,
                              NotificationService notifications) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.access = access;
        this.files = files;
        this.notifications = notifications;
    }

    @GetMapping
    public List<MaterialView> list(@RequestParam Long courseId, Authentication authentication) {
        access.requireView(courseId, currentUser.require(authentication));
        return jdbc.sql("""
                SELECT m.id, m.course_id, m.title, m.type, m.url, m.file_name, u.full_name AS created_by_name, m.created_at
                FROM materials m JOIN users u ON u.id=m.created_by
                WHERE m.course_id=:course ORDER BY m.created_at DESC
                """).param("course", courseId).query(MaterialView.class).list();
    }

    @PostMapping(consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    public MaterialView create(@RequestParam Long courseId, @RequestParam @NotBlank String title,
                               @RequestParam String type, @RequestParam(required = false) String url,
                               @RequestPart(required = false) MultipartFile file, Authentication authentication) {
        var user = currentUser.require(authentication);
        access.requireManage(courseId, user);
        String fileName = null;
        if ("FILE".equals(type)) {
            var stored = files.save(file, "materials");
            fileName = stored.name();
            url = stored.url();
        } else {
            url = requireWebLink(url);
        }
        var id = jdbc.sql("""
                INSERT INTO materials(course_id, title, type, url, file_name, created_by)
                VALUES (:course, :title, :type, :url, :fileName, :user) RETURNING id
                """).param("course", courseId).param("title", title).param("type", type)
                .param("url", url == null ? "" : url).param("fileName", fileName).param("user", user.id())
                .query(Long.class).single();
        notifications.notifyCourseStudents(courseId, user.id(), "MATERIAL_ADDED",
                "New material: " + title, null, "materials");
        return get(id);
    }

    /**
     * Accepts only an ordinary web address for a link, video or live class.
     *
     * What is stored here is rendered straight into a link the class will click, so any
     * scheme the browser can be talked into running - javascript:, data: - would turn adding
     * a material into a way to run code in a student's session. Only the two schemes that
     * mean "another page on the web" get through.
     */
    private String requireWebLink(String url) {
        var trimmed = url == null ? "" : url.trim();
        var lower = trimmed.toLowerCase(java.util.Locale.ROOT);
        if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a link starting with http:// or https://");
        }
        return trimmed;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id, Authentication authentication) {
        var course = jdbc.sql("SELECT course_id FROM materials WHERE id=:id").param("id", id).query(Long.class).single();
        access.requireManage(course, currentUser.require(authentication));
        // Read the URL before the row goes, or the file can never be found again. A LINK
        // material points at somewhere external, which FileStorage ignores by design.
        var url = jdbc.sql("SELECT url FROM materials WHERE id=:id").param("id", id)
                .query(String.class).optional().orElse(null);
        jdbc.sql("DELETE FROM materials WHERE id=:id").param("id", id).update();
        // After the row, so a failed delete leaves an orphaned file rather than a row
        // pointing at a file that is already gone.
        files.delete(url);
    }

    private MaterialView get(Long id) {
        return jdbc.sql("""
                SELECT m.id, m.course_id, m.title, m.type, m.url, m.file_name, u.full_name AS created_by_name, m.created_at
                FROM materials m JOIN users u ON u.id=m.created_by WHERE m.id=:id
                """).param("id", id).query(MaterialView.class).single();
    }

    public record MaterialView(Long id, Long courseId, String title, String type, String url, String fileName,
                               String createdByName, OffsetDateTime createdAt) {}
}
