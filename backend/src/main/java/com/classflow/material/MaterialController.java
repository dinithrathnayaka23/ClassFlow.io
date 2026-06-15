package com.classflow.material;

import com.classflow.common.CourseAccess;
import com.classflow.common.FileStorage;
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

    public MaterialController(JdbcClient jdbc, CurrentUser currentUser, CourseAccess access, FileStorage files) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.access = access;
        this.files = files;
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
        }
        var id = jdbc.sql("""
                INSERT INTO materials(course_id, title, type, url, file_name, created_by)
                VALUES (:course, :title, :type, :url, :fileName, :user) RETURNING id
                """).param("course", courseId).param("title", title).param("type", type)
                .param("url", url == null ? "" : url).param("fileName", fileName).param("user", user.id())
                .query(Long.class).single();
        return get(id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id, Authentication authentication) {
        var course = jdbc.sql("SELECT course_id FROM materials WHERE id=:id").param("id", id).query(Long.class).single();
        access.requireManage(course, currentUser.require(authentication));
        jdbc.sql("DELETE FROM materials WHERE id=:id").param("id", id).update();
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
