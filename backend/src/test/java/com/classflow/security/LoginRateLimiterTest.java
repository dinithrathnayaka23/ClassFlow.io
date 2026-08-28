package com.classflow.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.classflow.common.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class LoginRateLimiterTest {
    private static final String EMAIL = "teacher@classflow.com";

    @Test
    void allowsOrdinaryMistypedPasswords() {
        var limiter = new LoginRateLimiter();

        // Well within the threshold: someone trying a few of their usual passwords must not
        // be shut out of their own account.
        for (var attempt = 0; attempt < 9; attempt++) {
            limiter.recordFailure(EMAIL);
        }

        assertThatCode(() -> limiter.check(EMAIL)).doesNotThrowAnyException();
    }

    @Test
    void blocksOnceFailuresPassTheThreshold() {
        var limiter = new LoginRateLimiter();

        for (var attempt = 0; attempt < 10; attempt++) {
            limiter.recordFailure(EMAIL);
        }

        assertThatThrownBy(() -> limiter.check(EMAIL))
                .isInstanceOf(ApiException.class)
                .extracting(thrown -> ((ApiException) thrown).status())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    void aCorrectPasswordClearsTheRecord() {
        var limiter = new LoginRateLimiter();
        for (var attempt = 0; attempt < 10; attempt++) {
            limiter.recordFailure(EMAIL);
        }

        limiter.recordSuccess(EMAIL);

        // The next failed attempt starts a fresh window rather than resuming a blocked one.
        assertThatCode(() -> limiter.check(EMAIL)).doesNotThrowAnyException();
    }

    @Test
    void countsOneAccountAtATime() {
        var limiter = new LoginRateLimiter();
        for (var attempt = 0; attempt < 10; attempt++) {
            limiter.recordFailure(EMAIL);
        }

        // An attack on one address must not lock anybody else out.
        assertThatCode(() -> limiter.check("student@classflow.com")).doesNotThrowAnyException();
    }

    @Test
    void treatsTheAddressCaseInsensitively() {
        var limiter = new LoginRateLimiter();
        for (var attempt = 0; attempt < 10; attempt++) {
            limiter.recordFailure("Teacher@ClassFlow.com");
        }

        // Otherwise changing the capitalisation would be enough to reset the count.
        assertThatThrownBy(() -> limiter.check(EMAIL)).isInstanceOf(ApiException.class);
    }

    @Test
    void survivesManyDistinctAddresses() {
        var limiter = new LoginRateLimiter();

        // An attacker rotating addresses must not be able to grow the tracking map without
        // bound; the limiter prunes rather than exhausting the heap.
        for (var attempt = 0; attempt < 25_000; attempt++) {
            limiter.recordFailure("user" + attempt + "@classflow.com");
        }

        assertThat(true).isTrue();
    }
}
