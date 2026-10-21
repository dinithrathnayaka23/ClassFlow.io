package com.classflow.chat;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.OffsetDateTime;

/**
 * Everything the server pushes to a user on /user/queue/chat.
 *
 * One queue with a type field, rather than a destination per kind, so a client needs a single
 * subscription and the order events arrive in is the order they happened in.
 *
 *   MESSAGE  a message you sent or received. clientId echoes the id a socket send carried,
 *            so the tab that sent it can tell its own message has been stored.
 *   READ     you read contactId's messages, possibly in another tab: clear that badge.
 *   SEEN     contactId read your messages at readAt: show the read ticks.
 *   UNREAD   your unread total changed: the sidebar badge.
 *   ERROR    a socket send with this clientId was refused, and why.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ChatEvent(String type, ChatController.MessageView message, String clientId, Long contactId,
                        OffsetDateTime readAt, Long total, String error) {

    static ChatEvent message(ChatController.MessageView message, String clientId) {
        return new ChatEvent("MESSAGE", message, clientId, null, null, null, null);
    }

    static ChatEvent read(Long contactId) {
        return new ChatEvent("READ", null, null, contactId, null, null, null);
    }

    static ChatEvent seen(Long contactId, OffsetDateTime readAt) {
        return new ChatEvent("SEEN", null, null, contactId, readAt, null, null);
    }

    static ChatEvent unread(long total) {
        return new ChatEvent("UNREAD", null, null, null, null, total, null);
    }

    static ChatEvent error(String clientId, String error) {
        return new ChatEvent("ERROR", null, clientId, null, null, null, error);
    }
}
