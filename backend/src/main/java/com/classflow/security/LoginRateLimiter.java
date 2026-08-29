package com.classflow.security;

import java.time.Duration;
import org.springframework.stereotype.Component;

/**
 * Slows down repeated failed sign-ins for one account.
 *
 * Without this, /api/auth/login answers as fast as the server can hash, which is all an
 * attacker needs to work through a password list against a known address. The threshold is
 * deliberately generous: someone who genuinely cannot remember which of their passwords they
 * used here should never be shut out, so the limit only bites well past normal fumbling, and
 * a single success clears the record entirely.
 *
 * The counting itself lives in AttemptLimiter, which the password reset endpoint uses too
 * with far tighter numbers.
 */
@Component
public class LoginRateLimiter extends AttemptLimiter {
    /** Failures tolerated inside one window before the account stops answering. */
    private static final int MAX_FAILURES = 10;
    /** How long failures accumulate, and how long a blocked account stays blocked. */
    private static final Duration WINDOW = Duration.ofMinutes(15);

    public LoginRateLimiter() {
        super(MAX_FAILURES, WINDOW,
                "Too many failed sign-in attempts. Wait a few minutes and try again.");
    }

    public void recordFailure(String email) {
        record(email);
    }

    /** A correct password clears the record, so an earlier bad run never follows a user around. */
    public void recordSuccess(String email) {
        clear(email);
    }
}
