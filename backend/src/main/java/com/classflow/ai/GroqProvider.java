package com.classflow.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Groq, which exposes an OpenAI-compatible chat completions endpoint. */
@Component
public class GroqProvider implements AiProvider {
    private final HttpClient http;
    private final ObjectMapper json;
    private final String apiKey;
    private final String model;
    private final String baseUrl;
    private final Duration timeout;

    public GroqProvider(HttpClient http, ObjectMapper json,
                        @Value("${app.ai.groq.api-key:}") String apiKey,
                        @Value("${app.ai.groq.model:llama-3.3-70b-versatile}") String model,
                        @Value("${app.ai.groq.base-url:https://api.groq.com/openai/v1}") String baseUrl,
                        @Value("${app.ai.timeout-seconds:20}") long timeoutSeconds) {
        this.http = http;
        this.json = json;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.model = model == null ? "" : model.trim();
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.timeout = Duration.ofSeconds(timeoutSeconds);
    }

    @Override
    public String name() {
        return "groq";
    }

    @Override
    public boolean configured() {
        return !apiKey.isBlank();
    }

    @Override
    public String complete(String systemPrompt, String question) throws Exception {
        var body = json.createObjectNode();
        body.put("model", model);
        body.put("temperature", 0.3);
        body.put("max_tokens", 600);
        var messages = body.putArray("messages");
        messages.addObject().put("role", "system").put("content", systemPrompt);
        messages.addObject().put("role", "user").put("content", question);

        var request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/chat/completions"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .timeout(timeout)
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body), StandardCharsets.UTF_8))
                .build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() / 100 != 2) {
            throw new IllegalStateException("Groq returned HTTP " + response.statusCode());
        }

        var answer = json.readTree(response.body())
                .path("choices").path(0).path("message").path("content").asText("").trim();
        if (answer.isBlank()) throw new IllegalStateException("Groq returned an empty answer");
        return answer;
    }
}
