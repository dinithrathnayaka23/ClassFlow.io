package com.classflow.ai;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AiHttpConfig {
    /** Shared client for all AI providers. Per-request timeouts are set on each request. */
    @Bean
    HttpClient aiHttpClient(@Value("${app.ai.timeout-seconds:20}") long timeoutSeconds) {
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(Math.min(timeoutSeconds, 10)))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }
}
