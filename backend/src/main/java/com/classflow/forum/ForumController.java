package com.classflow.forum;

import com.classflow.common.ApiException;
import com.classflow.common.CourseAccess;
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
@RequestMapping("/api/forums")
public class ForumController {
    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final CourseAccess access;

    public ForumController(JdbcClient jdbc, CurrentUser currentUser, CourseAccess access) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.access = access;
    }

    @GetMapping
    public List<TopicView> topics(@RequestParam Long courseId, Authentication authentication) {
        access.requireView(courseId, currentUser.require(authentication));
        return jdbc.sql("""
                SELECT t.id, t.course_id, t.title, t.body, u.full_name AS author, t.created_at,
                       (SELECT COUNT(*) FROM forum_posts p WHERE p.topic_id=t.id) AS reply_count
                FROM forum_topics t JOIN users u ON u.id=t.created_by
                WHERE t.course_id=:course ORDER BY t.created_at DESC
                """).param("course", courseId).query(TopicView.class).list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TopicView create(@Valid @RequestBody TopicRequest request, Authentication authentication) {
        var user = currentUser.require(authentication);
        access.requireManage(request.courseId(), user);
        var id = jdbc.sql("""
                INSERT INTO forum_topics(course_id, title, body, created_by)
                VALUES (:course, :title, :body, :user) RETURNING id
                """).param("course", request.courseId()).param("title", request.title())
                .param("body", request.body()).param("user", user.id()).query(Long.class).single();
        return topic(id);
    }

    @GetMapping("/{id}/posts")
    public List<PostView> posts(@PathVariable Long id, Authentication authentication) {
        var course = courseForTopic(id);
        access.requireView(course, currentUser.require(authentication));
        return jdbc.sql("""
                SELECT p.id, p.topic_id, p.body, p.created_by, u.full_name AS author, u.role AS author_role, p.created_at
                FROM forum_posts p JOIN users u ON u.id=p.created_by
                WHERE p.topic_id=:topic ORDER BY p.created_at
                """).param("topic", id).query(PostView.class).list();
    }

    @PostMapping("/{id}/posts")
    @ResponseStatus(HttpStatus.CREATED)
    public PostView reply(@PathVariable Long id, @Valid @RequestBody PostRequest request, Authentication authentication) {
        var user = currentUser.require(authentication);
        access.requireView(courseForTopic(id), user);
        var postId = jdbc.sql("""
                INSERT INTO forum_posts(topic_id, body, created_by) VALUES (:topic, :body, :user) RETURNING id
                """).param("topic", id).param("body", request.body()).param("user", user.id()).query(Long.class).single();
        return jdbc.sql("""
                SELECT p.id, p.topic_id, p.body, p.created_by, u.full_name AS author, u.role AS author_role, p.created_at
                FROM forum_posts p JOIN users u ON u.id=p.created_by WHERE p.id=:id
                """).param("id", postId).query(PostView.class).single();
    }

    private Long courseForTopic(Long id) {
        return jdbc.sql("SELECT course_id FROM forum_topics WHERE id=:id").param("id", id).query(Long.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Forum topic not found"));
    }

    private TopicView topic(Long id) {
        return jdbc.sql("""
                SELECT t.id, t.course_id, t.title, t.body, u.full_name AS author, t.created_at,
                       (SELECT COUNT(*) FROM forum_posts p WHERE p.topic_id=t.id) AS reply_count
                FROM forum_topics t JOIN users u ON u.id=t.created_by WHERE t.id=:id
                """).param("id", id).query(TopicView.class).single();
    }

    public record TopicRequest(Long courseId, @NotBlank String title, @NotBlank String body) {}
    public record PostRequest(@NotBlank String body) {}
    public record TopicView(Long id, Long courseId, String title, String body, String author, OffsetDateTime createdAt,
                            long replyCount) {}
    public record PostView(Long id, Long topicId, String body, Long createdBy, String author, String authorRole,
                           OffsetDateTime createdAt) {}
}
