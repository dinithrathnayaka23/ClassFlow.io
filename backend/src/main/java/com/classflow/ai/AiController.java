package com.classflow.ai;

import com.classflow.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ai")
public class AiController {
    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final AiService ai;

    public AiController(JdbcClient jdbc, CurrentUser currentUser, AiService ai) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.ai = ai;
    }

    @PostMapping("/ask")
    public Map<String, String> ask(@Valid @RequestBody AskRequest request, Authentication authentication) {
        var user = currentUser.require(authentication);
        var answer = ai.ask(request.question().trim(), user.role());
        jdbc.sql("INSERT INTO ai_chat_logs(user_id, question, answer) VALUES (:user, :question, :answer)")
                .param("user", user.id()).param("question", request.question().trim())
                .param("answer", answer.text()).update();
        return Map.of("answer", answer.text(), "provider", answer.provider());
    }

    public record AskRequest(
            @NotBlank(message = "Ask a question first")
            @Size(max = 2000, message = "Question is too long") String question) {}
}
