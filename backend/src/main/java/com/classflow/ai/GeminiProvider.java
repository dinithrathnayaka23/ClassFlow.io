package com.classflow.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Google Generative Language API (Gemini). */
@Component
public class GeminiProvider implements AiProvider {
    private final HttpClient http;
    private final ObjectMapper json;
    private final String apiKey;
    private final String model;
    private final String baseUrl;
    private final Duration timeout;

    public GeminiProvider(HttpClient http, ObjectMapper json,
                          @Value("${app.ai.gemini.api-key:}") String apiKey,
                          @Value("${app.ai.gemini.model:gemini-2.0-flash}") String model,
                          @Value("${app.ai.gemini.base-url:https://generativelanguage.googleapis.com/v1beta}") String baseUrl,
                          @Value("${app.ai.timeout-seconds:20}") long timeoutSeconds) {
        this.http = http;
        this.json = json;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        // ListModels reports names as "models/gemini-2.0-flash". Accept either form,
        // since the URL below adds the "models/" segment itself.
        var trimmed = model == null ? "" : model.trim();
        this.model = trimmed.startsWith("models/") ? trimmed.substring("models/".length()) : trimmed;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.timeout = Duration.ofSeconds(timeoutSeconds);
    }

    @Override
    public String name() {
        return "gemini";
    }

    @Override
    public boolean configured() {
        return !apiKey.isBlank();
    }

    @Override
    public String complete(String systemPrompt, String question) throws Exception {
        var body = json.createObjectNode();
        body.putObject("systemInstruction").putArray("parts").addObject().put("text", systemPrompt);
        var content = body.putArray("contents").addObject();
        content.put("role", "user");
        content.putArray("parts").addObject().put("text", question);
        var config = body.putObject("generationConfig");
        config.put("temperature", 0.3);
        config.put("maxOutputTokens", 600);

        // The key travels as a header rather than a query parameter so it cannot
        // leak through request logs or proxy access logs.
        var request = HttpRequest.newBuilder()
                .uri(URI.create("%s/models/%s:generateContent".formatted(baseUrl, URLEncoder.encode(model, StandardCharsets.UTF_8))))
                .header("Content-Type", "application/json")
                .header("x-goog-api-key", apiKey)
                .timeout(timeout)
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body), StandardCharsets.UTF_8))
                .build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() / 100 != 2) {
            throw new IllegalStateException("Gemini returned HTTP " + response.statusCode());
        }

        var root = json.readTree(response.body());
        var blocked = root.path("promptFeedback").path("blockReason").asText("");
        if (!blocked.isBlank()) throw new IllegalStateException("Gemini blocked the prompt: " + blocked);

        // A candidate may be split across several parts; join them all.
        var text = new StringBuilder();
        for (var part : root.path("candidates").path(0).path("content").path("parts")) {
            text.append(part.path("text").asText(""));
        }
        var answer = text.toString().trim();
        if (answer.isBlank()) throw new IllegalStateException("Gemini returned an empty answer");
        return answer;
    }
}
