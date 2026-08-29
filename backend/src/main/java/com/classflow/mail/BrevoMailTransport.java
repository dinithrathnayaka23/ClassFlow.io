package com.classflow.mail;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Sends through Brevo's HTTP API rather than over SMTP.
 *
 * This exists because hosting platforms block outbound SMTP. On Render a connection to
 * port 587 simply times out, whoever the provider is, so the fix is not a different mail
 * account but a different port: this posts to https://api.brevo.com over 443, which nothing
 * blocks. Any provider with a send-mail endpoint would do; Brevo is here because its free
 * tier sends to any recipient once a sender address is verified, which a school platform
 * needs - several services only allow mail to your own address until you own a domain.
 *
 * The HttpClient is the one the AI providers already share. A second client would mean a
 * second connection pool and thread stack for the handful of calls this makes, which is real
 * memory on the small instance the Dockerfile is tuned for.
 */
@Component
public class BrevoMailTransport implements MailTransport {
    private final HttpClient http;
    private final ObjectMapper json;
    private final String apiKey;
    private final String baseUrl;
    private final String from;
    private final String fromName;
    private final Duration timeout;

    public BrevoMailTransport(HttpClient http, ObjectMapper json,
                              @Value("${app.mail.brevo.api-key:}") String apiKey,
                              @Value("${app.mail.brevo.base-url:https://api.brevo.com/v3}") String baseUrl,
                              @Value("${app.mail.from:}") String from,
                              @Value("${app.mail.from-name:ClassFlow}") String fromName,
                              @Value("${app.mail.timeout-seconds:15}") long timeoutSeconds) {
        this.http = http;
        this.json = json;
        this.apiKey = trim(apiKey);
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.from = trim(from);
        this.fromName = fromName;
        this.timeout = Duration.ofSeconds(timeoutSeconds);
    }

    @Override
    public String name() {
        return "brevo";
    }

    /**
     * Both the key and a From are required. Unlike SMTP there is no mailbox to fall back on -
     * the API has no idea who we are beyond what the request says - and Brevo rejects a sender
     * it has not verified, so a missing MAIL_FROM would fail on every single send.
     */
    @Override
    public boolean configured() {
        return !apiKey.isBlank() && !from.isBlank();
    }

    @Override
    public String describe() {
        return "Brevo HTTP API as " + from;
    }

    @Override
    public void deliver(String to, String subject, String html, String text) throws Exception {
        var body = json.createObjectNode();
        body.putObject("sender").put("name", fromName).put("email", from);
        body.putArray("to").addObject().put("email", to);
        body.put("subject", subject);
        body.put("htmlContent", html);
        body.put("textContent", text);

        var request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/smtp/email"))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .header("api-key", apiKey)
                .timeout(timeout)
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body), StandardCharsets.UTF_8))
                .build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() / 100 != 2) {
            // The body carries Brevo's own reason - an unverified sender, an exhausted quota -
            // which is the whole diagnosis, so it goes in the message rather than being
            // reduced to a status code.
            throw new IllegalStateException(
                    "Brevo returned HTTP " + response.statusCode() + ": " + response.body());
        }
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }
}
