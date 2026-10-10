package com.classflow.chat;

import com.classflow.security.UserPrincipal;
import com.classflow.user.UserRepository;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Component;

/**
 * Decides who a chat socket belongs to, and what it may touch.
 *
 * CONNECT is authenticated from a ticket (see ChatTicketService), falling back to the principal
 * the handshake carried when the cookie reached it. A socket that has neither is refused at
 * CONNECT, so nothing downstream ever runs for an anonymous connection.
 *
 * The destination rules matter as much as the identity. The simple broker accepts a SEND to
 * any destination it serves, so without them a client could publish straight onto
 * /queue/... or /topic/... and put a forged event in front of someone else. Clients may only
 * send to the application (/app/**), where every message goes through ChatController's checks,
 * and only subscribe to their own user queues (/user/queue/**), which the server resolves to
 * this session alone.
 */
@Component
public class SocketAuthInterceptor implements ChannelInterceptor {
    private final ChatTicketService tickets;
    private final UserRepository users;

    public SocketAuthInterceptor(ChatTicketService tickets, UserRepository users) {
        this.tickets = tickets;
        this.users = users;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        var accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) return message;
        switch (accessor.getCommand()) {
            case CONNECT -> authenticate(accessor);
            case SEND -> requireDestination(accessor, "/app/");
            case SUBSCRIBE -> requireDestination(accessor, "/user/queue/");
            default -> { }
        }
        return message;
    }

    private void authenticate(StompHeaderAccessor accessor) {
        var ticket = accessor.getFirstNativeHeader("ticket");
        if (ticket != null) {
            var user = tickets.redeem(ticket)
                    .flatMap(users::findPrincipalByEmail)
                    .filter(UserPrincipal::active)
                    .orElseThrow(() -> new MessagingException("This chat connection could not be verified"));
            accessor.setUser(new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
            return;
        }
        if (accessor.getUser() == null) throw new MessagingException("Authentication required");
    }

    private void requireDestination(StompHeaderAccessor accessor, String prefix) {
        var destination = accessor.getDestination();
        if (destination == null || !destination.startsWith(prefix)) {
            throw new MessagingException("Destination not allowed: " + destination);
        }
    }
}
