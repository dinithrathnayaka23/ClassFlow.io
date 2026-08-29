package com.classflow.security;

import com.classflow.common.ApiException;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.http.HttpStatus;

/**
 * Counts attempts against a key inside a sliding window and refuses once there are too many.
 *
 * Two endpoints need this and they need different numbers: signing in tolerates a lot of
 * fumbling before it bites, while asking for a password reset link should be rare, because
 * every request sends mail to somebody who did not necessarily ask for it. The mechanism is
 * identical in both cases, so it lives here once and each caller supplies its own threshold,
 * window and message.
 *
 * State is held in memory rather than in the database. That is the right trade for a single
 * instance - it costs nothing and needs no migration - but it does mean the count resets on
 * restart, and that two instances behind a load balancer would each keep their own tally.
 * Moving to a shared store is the change to make when this runs on more than one node.
 */
public class AttemptLimiter {
    /**
     * A ceiling on how many keys are tracked at once. The map is keyed by whatever the caller
     * sends, so an attacker rotating addresses would otherwise grow it without bound until the
     * server runs out of heap - the very outage this class exists to prevent.
     */
    private static final int MAX_TRACKED = 10_000;

    private final Map<String, Attempts> attempts = new ConcurrentHashMap<>();
    private final int maxAttempts;
    private final Duration window;
    private final String message;

    public AttemptLimiter(int maxAttempts, Duration window, String message) {
        this.maxAttempts = maxAttempts;
        this.window = window;
        this.message = message;
    }

    /** Throws once a key has been used too often, until its window expires. */
    public void check(String key) {
        var seen = attempts.get(normalise(key));
        if (seen == null || seen.expired(window)) return;
        if (seen.count.get() >= maxAttempts) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, message);
        }
    }

    public void record(String key) {
        if (attempts.size() >= MAX_TRACKED) prune();
        attempts.compute(normalise(key), (ignored, existing) ->
                existing == null || existing.expired(window) ? new Attempts() : existing.increment());
    }

    /** Wipes a key's tally, for the outcome that proves the traffic was legitimate. */
    public void clear(String key) {
        attempts.remove(normalise(key));
    }

    private void prune() {
        attempts.values().removeIf(seen -> seen.expired(window));
        // Still full of live entries: this is an attack rather than ordinary traffic, and
        // dropping the table is better than exhausting the heap. The keys under attack
        // simply start counting again.
        if (attempts.size() >= MAX_TRACKED) attempts.clear();
    }

    private String normalise(String key) {
        return key == null ? "" : key.trim().toLowerCase(Locale.ROOT);
    }

    private static final class Attempts {
        private final AtomicInteger count = new AtomicInteger(1);
        private final Instant startedAt = Instant.now();

        boolean expired(Duration window) {
            return startedAt.plus(window).isBefore(Instant.now());
        }

        Attempts increment() {
            count.incrementAndGet();
            return this;
        }
    }
}
