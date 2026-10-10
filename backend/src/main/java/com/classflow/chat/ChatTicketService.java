package com.classflow.chat;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Short-lived, single-use passes that let a chat socket prove who it belongs to.
 *
 * The auth cookie is HTTP-only, so script cannot read it to hand to the socket, and it only
 * reaches the handshake when the socket goes through the same origin as the API. A deployment
 * that points the socket straight at the API's own host has no cookie to offer at all. So the
 * client asks for a ticket over the REST API, where the cookie always works, and presents it
 * in the STOMP CONNECT frame. A ticket is worth one connection and expires within a minute, so
 * one that leaks into a log or a proxy is useless by the time anyone reads it.
 *
 * Tickets live in memory, like the simple broker they unlock: both are per instance, and both
 * move to a shared store when this runs on more than one node.
 */
@Component
public class ChatTicketService {
    private static final Duration LIFETIME = Duration.ofSeconds(60);
    /** Bounds the map for the same reason AttemptLimiter does: callers decide how often we grow it. */
    private static final int MAX_OUTSTANDING = 10_000;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();

    private final Map<String, Ticket> tickets = new ConcurrentHashMap<>();

    public String issue(String email) {
        if (tickets.size() >= MAX_OUTSTANDING) prune();
        var bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        var ticket = ENCODER.encodeToString(bytes);
        tickets.put(ticket, new Ticket(email, Instant.now().plus(LIFETIME)));
        return ticket;
    }

    /** Spends a ticket, returning who it was issued to. Empty when unknown, already used or expired. */
    public Optional<String> redeem(String ticket) {
        if (ticket == null || ticket.isBlank()) return Optional.empty();
        var found = tickets.remove(ticket);
        if (found == null || found.expiresAt().isBefore(Instant.now())) return Optional.empty();
        return Optional.of(found.email());
    }

    private void prune() {
        var now = Instant.now();
        tickets.values().removeIf(ticket -> ticket.expiresAt().isBefore(now));
        // Still full of live tickets: someone is minting them in a loop. Dropping the lot only
        // costs honest clients a reconnect, which asks for a fresh ticket anyway.
        if (tickets.size() >= MAX_OUTSTANDING) tickets.clear();
    }

    private record Ticket(String email, Instant expiresAt) {}
}
