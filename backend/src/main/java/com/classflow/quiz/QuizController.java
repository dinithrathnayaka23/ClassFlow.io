package com.classflow.quiz;

import com.classflow.common.ApiException;
import com.classflow.common.CourseAccess;
import com.classflow.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/quizzes")
public class QuizController {
    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final CourseAccess access;

    public QuizController(JdbcClient jdbc, CurrentUser currentUser, CourseAccess access) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.access = access;
    }

    @GetMapping
    public List<QuizView> list(@RequestParam Long courseId, Authentication authentication) {
        var user = currentUser.require(authentication);
        access.requireView(courseId, user);
        return jdbc.sql("""
                SELECT q.id, q.course_id, q.title, q.description, q.duration_minutes, q.starts_at, q.ends_at,
                       a.score, a.max_score, a.submitted_at,
                       (SELECT COUNT(*) FROM quiz_questions x WHERE x.quiz_id=q.id) AS question_count
                FROM quizzes q LEFT JOIN quiz_attempts a ON a.quiz_id=q.id AND a.student_id=:user
                WHERE q.course_id=:course ORDER BY q.starts_at DESC
                """).param("course", courseId).param("user", user.id()).query(QuizView.class).list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public QuizView create(@Valid @RequestBody QuizRequest request, Authentication authentication) {
        var user = currentUser.require(authentication);
        access.requireManage(request.courseId(), user);
        if (!request.endsAt().isAfter(request.startsAt())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Quiz end time must be after start time");
        }
        var quizId = jdbc.sql("""
                INSERT INTO quizzes(course_id, title, description, duration_minutes, starts_at, ends_at, created_by)
                VALUES (:course, :title, :description, :duration, :starts, :ends, :user) RETURNING id
                """).param("course", request.courseId()).param("title", request.title())
                .param("description", request.description()).param("duration", request.durationMinutes())
                .param("starts", request.startsAt()).param("ends", request.endsAt()).param("user", user.id())
                .query(Long.class).single();
        var position = 0;
        for (var question : request.questions()) {
            if (question.options().size() < 2 || question.options().stream().filter(OptionRequest::correct).count() != 1) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Each question needs at least two options and exactly one correct answer");
            }
            var questionId = jdbc.sql("""
                    INSERT INTO quiz_questions(quiz_id, prompt, points, position)
                    VALUES (:quiz, :prompt, :points, :position) RETURNING id
                    """).param("quiz", quizId).param("prompt", question.prompt()).param("points", question.points())
                    .param("position", ++position).query(Long.class).single();
            for (var option : question.options()) {
                jdbc.sql("INSERT INTO quiz_options(question_id, text, correct) VALUES (:question, :text, :correct)")
                        .param("question", questionId).param("text", option.text()).param("correct", option.correct()).update();
            }
        }
        return get(quizId, user.id());
    }

    @GetMapping("/{id}")
    public Map<String, Object> detail(@PathVariable Long id, Authentication authentication) {
        var user = currentUser.require(authentication);
        var quiz = get(id, user.id());
        access.requireView(quiz.courseId(), user);
        var questions = jdbc.sql("""
                SELECT id, prompt, points, position FROM quiz_questions WHERE quiz_id=:quiz ORDER BY position
                """).param("quiz", id).query(QuestionView.class).list();
        var questionViews = questions.stream().map(question -> {
            var options = "STUDENT".equals(user.role())
                    ? jdbc.sql("SELECT id, text, NULL::boolean AS correct FROM quiz_options WHERE question_id=:id ORDER BY id")
                        .param("id", question.id()).query(OptionView.class).list()
                    : jdbc.sql("SELECT id, text, correct FROM quiz_options WHERE question_id=:id ORDER BY id")
                        .param("id", question.id()).query(OptionView.class).list();
            return Map.of("id", question.id(), "prompt", question.prompt(), "points", question.points(), "options", options);
        }).toList();
        var result = new LinkedHashMap<String, Object>();
        result.put("quiz", quiz);
        result.put("questions", questionViews);
        return result;
    }

    @PostMapping("/{id}/start")
    public AttemptView start(@PathVariable Long id, Authentication authentication) {
        var user = currentUser.require(authentication);
        if (!"STUDENT".equals(user.role())) throw new ApiException(HttpStatus.FORBIDDEN, "Only students attempt quizzes");
        var quiz = get(id, user.id());
        access.requireView(quiz.courseId(), user);
        var now = OffsetDateTime.now();
        if (now.isBefore(quiz.startsAt()) || now.isAfter(quiz.endsAt())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Quiz is not currently available");
        }
        jdbc.sql("""
                INSERT INTO quiz_attempts(quiz_id, student_id) VALUES (:quiz, :student)
                ON CONFLICT (quiz_id, student_id) DO NOTHING
                """).param("quiz", id).param("student", user.id()).update();
        return attempt(id, user.id());
    }

    @PostMapping("/{id}/submit")
    @Transactional
    public AttemptView submit(@PathVariable Long id, @RequestBody SubmitRequest request, Authentication authentication) {
        var user = currentUser.require(authentication);
        var quiz = get(id, user.id());
        var attempt = attempt(id, user.id());
        if (attempt.submittedAt() != null) throw new ApiException(HttpStatus.CONFLICT, "Quiz was already submitted");
        var deadline = attempt.startedAt().plus(quiz.durationMinutes(), ChronoUnit.MINUTES);
        if (OffsetDateTime.now().isAfter(deadline) || OffsetDateTime.now().isAfter(quiz.endsAt())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Quiz submission time has expired");
        }
        for (var answer : request.answers()) {
            var correct = jdbc.sql("""
                    SELECT o.correct FROM quiz_options o JOIN quiz_questions q ON q.id=o.question_id
                    WHERE o.id=:option AND q.id=:question AND q.quiz_id=:quiz
                    """).param("option", answer.optionId()).param("question", answer.questionId()).param("quiz", id)
                    .query(Boolean.class).optional()
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Answer does not belong to this quiz"));
            jdbc.sql("""
                    INSERT INTO quiz_attempt_answers(attempt_id, question_id, selected_option_id, correct)
                    VALUES (:attempt, :question, :option, :correct)
                    ON CONFLICT (attempt_id, question_id) DO UPDATE
                    SET selected_option_id=EXCLUDED.selected_option_id, correct=EXCLUDED.correct
                    """).param("attempt", attempt.id()).param("question", answer.questionId())
                    .param("option", answer.optionId()).param("correct", correct).update();
        }
        var score = jdbc.sql("""
                SELECT COALESCE(SUM(q.points), 0) FROM quiz_attempt_answers a
                JOIN quiz_questions q ON q.id=a.question_id WHERE a.attempt_id=:attempt AND a.correct
                """).param("attempt", attempt.id()).query(Integer.class).single();
        var max = jdbc.sql("SELECT COALESCE(SUM(points), 0) FROM quiz_questions WHERE quiz_id=:quiz")
                .param("quiz", id).query(Integer.class).single();
        jdbc.sql("UPDATE quiz_attempts SET submitted_at=NOW(), score=:score, max_score=:max WHERE id=:id")
                .param("score", score).param("max", max).param("id", attempt.id()).update();
        return attempt(id, user.id());
    }

    private QuizView get(Long id, Long user) {
        return jdbc.sql("""
                SELECT q.id, q.course_id, q.title, q.description, q.duration_minutes, q.starts_at, q.ends_at,
                       a.score, a.max_score, a.submitted_at,
                       (SELECT COUNT(*) FROM quiz_questions x WHERE x.quiz_id=q.id) AS question_count
                FROM quizzes q LEFT JOIN quiz_attempts a ON a.quiz_id=q.id AND a.student_id=:user WHERE q.id=:id
                """).param("id", id).param("user", user).query(QuizView.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Quiz not found"));
    }

    private AttemptView attempt(Long quiz, Long student) {
        return jdbc.sql("""
                SELECT id, quiz_id, student_id, started_at, submitted_at, score, max_score
                FROM quiz_attempts WHERE quiz_id=:quiz AND student_id=:student
                """).param("quiz", quiz).param("student", student).query(AttemptView.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Start the quiz before submitting"));
    }

    public record QuizRequest(Long courseId, @NotBlank String title, String description, int durationMinutes,
                              OffsetDateTime startsAt, OffsetDateTime endsAt, @NotEmpty List<QuestionRequest> questions) {}
    public record QuestionRequest(@NotBlank String prompt, int points, @NotEmpty List<OptionRequest> options) {}
    public record OptionRequest(@NotBlank String text, boolean correct) {}
    public record QuizView(Long id, Long courseId, String title, String description, int durationMinutes,
                           OffsetDateTime startsAt, OffsetDateTime endsAt, Integer score, Integer maxScore,
                           OffsetDateTime submittedAt, long questionCount) {}
    public record QuestionView(Long id, String prompt, int points, int position) {}
    public record OptionView(Long id, String text, Boolean correct) {}
    public record SubmitRequest(List<AnswerRequest> answers) {}
    public record AnswerRequest(Long questionId, Long optionId) {}
    public record AttemptView(Long id, Long quizId, Long studentId, OffsetDateTime startedAt,
                              OffsetDateTime submittedAt, Integer score, Integer maxScore) {}
}
