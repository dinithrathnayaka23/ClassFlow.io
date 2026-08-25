package com.classflow.ai;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Answers platform questions by trying each configured provider in order and
 * taking the first usable reply.
 *
 * A provider is skipped when it has no API key, and moved past when it errors,
 * times out, or returns nothing. If every provider fails the built-in guidance
 * is returned, so AI help degrades rather than breaking: the feature keeps
 * working with no keys configured at all.
 */
@Service
public class AiService {
    private static final Logger log = LoggerFactory.getLogger(AiService.class);

    private final List<AiProvider> providers;

    public AiService(List<AiProvider> available, @Value("${app.ai.order:gemini,groq}") String order) {
        // Explicit configuration decides precedence, not bean discovery order.
        var ordered = new ArrayList<AiProvider>();
        for (var name : Arrays.stream(order.split(",")).map(String::trim).filter(s -> !s.isBlank()).toList()) {
            available.stream()
                    .filter(provider -> provider.name().equalsIgnoreCase(name))
                    .findFirst()
                    .ifPresent(ordered::add);
        }
        // Anything not named in the order still gets a turn, after those that were.
        available.stream().filter(provider -> !ordered.contains(provider)).forEach(ordered::add);
        this.providers = List.copyOf(ordered);
    }

    public Answer ask(String question, String role) {
        var systemPrompt = systemPrompt(role);
        for (var provider : providers) {
            if (!provider.configured()) {
                log.debug("AI provider {} has no API key, skipping.", provider.name());
                continue;
            }
            try {
                var answer = provider.complete(systemPrompt, question);
                log.info("AI question answered by {}.", provider.name());
                return new Answer(answer, provider.name());
            } catch (Exception exception) {
                // Never log the exception's request context; it can carry the key.
                // Connection failures carry no message, so fall back to the type name.
                var reason = exception.getMessage() == null || exception.getMessage().isBlank()
                        ? exception.getClass().getSimpleName()
                        : exception.getMessage();
                log.warn("AI provider {} failed ({}), trying the next one.", provider.name(), reason);
            }
        }
        log.info("No AI provider answered; using built-in guidance.");
        return new Answer(builtIn(question), "builtin");
    }

    private String systemPrompt(String role) {
        return """
                You are ClassFlow Help, the built-in assistant for ClassFlow, a tuition class platform.
                The person asking is signed in as a %s.

                ClassFlow has these areas: Dashboard, Courses (each with a lesson plan), Materials
                (files, links, videos and live-class links), Quizzes (timed multiple-choice, with an
                availability window and a per-student duration), Assignments (a teacher uploads a
                brief, students upload their work, teachers give marks and feedback), Forums, direct
                Chat, and Profile.

                Answer only questions about using ClassFlow. Be concise and practical: name the menu
                item and the steps to follow. Use at most four sentences. If a question is outside
                ClassFlow, say so briefly and point them back to what the platform can do.
                """.formatted(role == null ? "user" : role.toLowerCase(Locale.ROOT));
    }

    /** Keyword guidance used when no provider is reachable. */
    private String builtIn(String question) {
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

    public record Answer(String text, String provider) {}
}
