package com.classflow.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class JwtServiceTest {
    @Test
    void createsTokenWithExpectedSubject() {
        var service = new JwtService("a-test-secret-that-is-at-least-thirty-two-characters", 1);
        var user = new UserPrincipal(7L, "teacher@classflow.com", "hash", "Test Teacher", "TEACHER", true);

        var token = service.create(user);

        assertThat(service.subject(token)).isEqualTo("teacher@classflow.com");
    }
}
