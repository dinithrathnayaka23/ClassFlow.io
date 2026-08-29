package com.classflow.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.classflow.common.ApiException;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/**
 * LoginRateLimiterTest covers the mechanism at the sign-in thresholds. This one covers what
 * password reset relies on and sign-in does not: a caller supplying its own, much tighter
 * numbers, and its own message.
 */
class AttemptLimiterTest {
    private static final String EMAIL = "student@classflow.com";
    private static final String MESSAGE = "Too many reset requests for this address.";

    private static AttemptLimiter limiter() {
        return new AttemptLimiter(3, Duration.ofHours(1), MESSAGE);
    }

    @Test
    void honoursTheThresholdItWasGiven() {
        var limiter = limiter();

        limiter.record(EMAIL);
        limiter.record(EMAIL);

        // Two of three used: somebody who asks twice because the first mail was slow must
        // still be able to ask again.
        assertThatCode(() -> limiter.check(EMAIL)).doesNotThrowAnyException();

        limiter.record(EMAIL);

        assertThatThrownBy(() -> limiter.check(EMAIL)).isInstanceOf(ApiException.class);
    }

    @Test
    void refusesWithTheCallersOwnMessageAndStatus() {
        var limiter = limiter();
        for (var attempt = 0; attempt < 3; attempt++) {
            limiter.record(EMAIL);
        }

        // The message matters: a reset endpoint answering "too many failed sign-in attempts"
        // would send people looking for a problem with their password.
        assertThatThrownBy(() -> limiter.check(EMAIL))
                .isInstanceOf(ApiException.class)
                .hasMessage(MESSAGE)
                .extracting(thrown -> ((ApiException) thrown).status())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    void clearingLetsTheAddressStartAgain() {
        var limiter = limiter();
        for (var attempt = 0; attempt < 3; attempt++) {
            limiter.record(EMAIL);
        }

        // What a completed reset does: they have proved they hold the mailbox, so the tally
        // that was protecting it is no longer meaningful.
        limiter.clear(EMAIL);

        assertThatCode(() -> limiter.check(EMAIL)).doesNotThrowAnyException();
    }

    @Test
    void countsEachAddressSeparately() {
        var limiter = limiter();
        for (var attempt = 0; attempt < 3; attempt++) {
            limiter.record(EMAIL);
        }

        // Otherwise anyone could stop everybody else recovering their account by exhausting
        // a shared count.
        assertThatCode(() -> limiter.check("teacher@classflow.com")).doesNotThrowAnyException();
    }

    @Test
    void aLimitOfZeroTurnsTheLimiterOff() {
        // The escape hatch for a deployment that would rather not have a cap. It must never
        // refuse, however many attempts it sees, and must say so about itself.
        var limiter = new AttemptLimiter(0, Duration.ofHours(1), MESSAGE);

        for (var attempt = 0; attempt < 50; attempt++) {
            limiter.record(EMAIL);
        }

        assertThat(limiter.isDisabled()).isTrue();
        assertThatCode(() -> limiter.check(EMAIL)).doesNotThrowAnyException();
    }

    @Test
    void aConfiguredLimitReportsItselfAsEnabled() {
        assertThat(limiter().isDisabled()).isFalse();
    }

    @Test
    void expiredWindowsStopBlocking() {
        // A window that has already passed by the time anything is recorded: the tally is
        // there, but it must not be what the next caller is judged on.
        var limiter = new AttemptLimiter(1, Duration.ofMillis(1), MESSAGE);
        limiter.record(EMAIL);

        assertThatCode(() -> {
            Thread.sleep(5);
            limiter.check(EMAIL);
        }).doesNotThrowAnyException();
    }
}
