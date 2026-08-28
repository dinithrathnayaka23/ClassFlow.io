package com.classflow.security;

import com.classflow.common.ApiException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.http.HttpStatus;
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
 * State is held in memory rather than in the database. That is the right trade for a single
 * instance - it costs nothing and needs no migration - but it does mean the count resets on
 * restart, and that two instances behind a load balancer would each keep their own tally.
 * Moving to a shared store is the change to make when this runs on more than one node.
 */
@Component
public class LoginRateLimiter {
    /** Failures tolerated inside one window before the account stops answering. */
    private static final int MAX_FAILURES = 10;
    /** How long failures accumulate, and how long a blocked account stays blocked. */
    private static final Duration WINDOW = Duration.ofMinutes(15);
    /**
     * A ceiling on how many addresses are tracked at once. The map is keyed by whatever the
     * caller sends, so an attacker rotating addresses would otherwise grow it without bound
     * until the server runs out of heap - the very outage this class exists to prevent.
     */
    private static final int MAX_TRACKED = 10_000;

    private final Map<String, Attempts> failures = new ConcurrentHashMap<>();

    /** Throws once an account has failed too often, until its window expires. */
    public void check(String key) {
        var attempts = failures.get(normalise(key));
        if (attempts == null || attempts.expired()) return;
        if (attempts.count.get() >= MAX_FAILURES) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many failed sign-in attempts. Wait a few minutes and try again.");
        }
    }

    public void recordFailure(String key) {
        if (failures.size() >= MAX_TRACKED) prune();
        failures.compute(normalise(key), (ignored, existing) ->
                existing == null || existing.expired() ? new Attempts() : existing.increment());
    }

    /** A correct password clears the record, so an earlier bad run never follows a user around. */
    public void recordSuccess(String key) {
        failures.remove(normalise(key));
    }

    private void prune() {
        failures.values().removeIf(Attempts::expired);
        // Still full of live entries: this is an attack rather than ordinary traffic, and
        // dropping the table is better than exhausting the heap. The accounts under attack
        // simply start counting again.
        if (failures.size() >= MAX_TRACKED) failures.clear();
    }

    private String normalise(String key) {
        return key == null ? "" : key.trim().toLowerCase(java.util.Locale.ROOT);
    }

    private static final class Attempts {
        private final AtomicInteger count = new AtomicInteger(1);
        private final Instant startedAt = Instant.now();

        boolean expired() {
            return startedAt.plus(WINDOW).isBefore(Instant.now());
        }

        Attempts increment() {
            count.incrementAndGet();
            return this;
        }
    }
}
