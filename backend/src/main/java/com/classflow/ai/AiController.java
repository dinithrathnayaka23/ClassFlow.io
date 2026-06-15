package com.classflow.ai;

import com.classflow.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.Locale;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ai")
public class AiController {
    private final JdbcClient jdbc;
    private final CurrentUser currentUser;

    public AiController(JdbcClient jdbc, CurrentUser currentUser) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
    }

    @PostMapping("/ask")
    public Map<String, String> ask(@Valid @RequestBody AskRequest request, Authentication authentication) {
        var user = currentUser.require(authentication);
        var answer = answer(request.question(), user.role());
        jdbc.sql("INSERT INTO ai_chat_logs(user_id, question, answer) VALUES (:user, :question, :answer)")
                .param("user", user.id()).param("question", request.question()).param("answer", answer).update();
        return Map.of("answer", answer);
    }

    private String answer(String question, String role) {
        var text = question.toLowerCase(Locale.ROOT);
        if (text.contains("upload") && text.contains("assignment")) {
            return "Open Assignments, choose the relevant course and assignment, then use Submit work to upload your PDF or document.";
        }
        if (text.contains("create") && text.contains("quiz")) {
            return "Open Quizzes from the teacher workspace, choose a course, set the availability and duration, then add MCQ questions and mark one correct option per question.";
        }
        if (text.contains("note") || text.contains("material")) {
            return "Open Materials and select your course. Files, videos, external resources and live-class links are listed there.";
        }
        if (text.contains("mark") || text.contains("result")) {
            return "Quiz scores appear after submission. Assignment marks and teacher feedback appear in the Assignments workspace once graded.";
        }
        return "I can help with courses, materials, quizzes, assignments, chat and forums. Ask me how to complete a task in ClassFlow.";
    }

    public record AskRequest(@NotBlank String question) {}
}
