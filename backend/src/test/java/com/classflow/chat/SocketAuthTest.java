package com.classflow.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.classflow.security.UserPrincipal;
import com.classflow.user.UserRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.messaging.support.MessageHeaderAccessor;

/**
 * The socket's identity and its destination rules. A regression in either one fails
 * silently: chat keeps working for honest clients while the gap stays open.
 */
class SocketAuthTest {
    private static final String EMAIL = "student@classflow.com";

    private final ChatTicketService tickets = new ChatTicketService();
    private final UserRepository users = mock(UserRepository.class);
    private final SocketAuthInterceptor interceptor = new SocketAuthInterceptor(tickets, users);

    @Test
    void aTicketWorksExactlyOnce() {
        var ticket = tickets.issue(EMAIL);

        assertThat(tickets.redeem(ticket)).contains(EMAIL);
        // A ticket that leaked into a log must not open a second connection.
        assertThat(tickets.redeem(ticket)).isEmpty();
    }

    @Test
    void unknownAndBlankTicketsRedeemToNobody() {
        assertThat(tickets.redeem("made-up")).isEmpty();
        assertThat(tickets.redeem("")).isEmpty();
        assertThat(tickets.redeem(null)).isEmpty();
    }

    @Test
    void connectWithATicketBecomesThatUser() {
        when(users.findPrincipalByEmail(EMAIL)).thenReturn(Optional.of(user(true)));
        var connect = frame(StompCommand.CONNECT, null);
        accessor(connect).setNativeHeader("ticket", tickets.issue(EMAIL));

        interceptor.preSend(connect, null);

        assertThat(accessor(connect).getUser()).isNotNull();
        assertThat(accessor(connect).getUser().getName()).isEqualTo(EMAIL);
    }

    @Test
    void connectIsRefusedForADisabledAccount() {
        when(users.findPrincipalByEmail(EMAIL)).thenReturn(Optional.of(user(false)));
        var connect = frame(StompCommand.CONNECT, null);
        accessor(connect).setNativeHeader("ticket", tickets.issue(EMAIL));

        assertThatThrownBy(() -> interceptor.preSend(connect, null)).isInstanceOf(MessagingException.class);
    }

    @Test
    void connectWithNeitherTicketNorCookieIsRefused() {
        assertThatThrownBy(() -> interceptor.preSend(frame(StompCommand.CONNECT, null), null))
                .isInstanceOf(MessagingException.class);
    }

    @Test
    void sendsReachOnlyTheApplication() {
        assertThatCode(() -> interceptor.preSend(frame(StompCommand.SEND, "/app/chat.send"), null))
                .doesNotThrowAnyException();
        // Straight onto the broker, this would put a forged event in someone else's queue.
        assertThatThrownBy(() -> interceptor.preSend(frame(StompCommand.SEND, "/queue/chat-user1"), null))
                .isInstanceOf(MessagingException.class);
        assertThatThrownBy(() -> interceptor.preSend(frame(StompCommand.SEND, "/topic/all"), null))
                .isInstanceOf(MessagingException.class);
    }

    @Test
    void subscriptionsReachOnlyYourOwnQueue() {
        assertThatCode(() -> interceptor.preSend(frame(StompCommand.SUBSCRIBE, "/user/queue/chat"), null))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> interceptor.preSend(frame(StompCommand.SUBSCRIBE, "/queue/chat-user1"), null))
                .isInstanceOf(MessagingException.class);
    }

    private static UserPrincipal user(boolean active) {
        return new UserPrincipal(1L, EMAIL, "hash", "Student", "STUDENT", null, active, null);
    }

    private static Message<byte[]> frame(StompCommand command, String destination) {
        var accessor = StompHeaderAccessor.create(command);
        if (destination != null) accessor.setDestination(destination);
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    private static StompHeaderAccessor accessor(Message<?> message) {
        return MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
    }
}
