package com.classflow.chat;

import com.classflow.common.ApiException;
import com.classflow.security.CurrentUser;
import com.classflow.user.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.security.Principal;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/chat")
public class ChatController {
    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final UserRepository users;
    private final SimpMessagingTemplate messaging;

    public ChatController(JdbcClient jdbc, CurrentUser currentUser, UserRepository users, SimpMessagingTemplate messaging) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.users = users;
        this.messaging = messaging;
    }

    @GetMapping("/contacts")
    public List<ContactView> contacts(Authentication authentication) {
        var user = currentUser.require(authentication);
        var targetRole = "STUDENT".equals(user.role()) ? "TEACHER" : "STUDENT";
        return jdbc.sql("""
                SELECT id, full_name, email, role FROM users WHERE active AND role=:role ORDER BY full_name
                """).param("role", targetRole).query(ContactView.class).list();
    }

    @GetMapping("/messages/{otherId}")
    public List<MessageView> history(@PathVariable Long otherId, Authentication authentication) {
        var user = currentUser.require(authentication);
        return jdbc.sql("""
                SELECT m.id, m.sender_id, sender.full_name AS sender_name, m.recipient_id, m.body, m.sent_at
                FROM chat_messages m JOIN users sender ON sender.id=m.sender_id
                WHERE (m.sender_id=:me AND m.recipient_id=:other) OR (m.sender_id=:other AND m.recipient_id=:me)
                ORDER BY m.sent_at
                """).param("me", user.id()).param("other", otherId).query(MessageView.class).list();
    }

    @PostMapping("/messages")
    public MessageView sendRest(@Valid @RequestBody SendRequest request, Authentication authentication) {
        return send(currentUser.require(authentication).id(), request);
    }

    @MessageMapping("/chat.send")
    public void sendSocket(SendRequest request, Principal principal) {
        var sender = users.findPrincipalByEmail(principal.getName())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Authentication required"));
        send(sender.id(), request);
    }

    private MessageView send(Long senderId, SendRequest request) {
        var recipient = users.require(request.recipientId());
        var id = jdbc.sql("""
                INSERT INTO chat_messages(sender_id, recipient_id, body) VALUES (:sender, :recipient, :body) RETURNING id
                """).param("sender", senderId).param("recipient", recipient.id()).param("body", request.body())
                .query(Long.class).single();
        var message = jdbc.sql("""
                SELECT m.id, m.sender_id, sender.full_name AS sender_name, m.recipient_id, m.body, m.sent_at
                FROM chat_messages m JOIN users sender ON sender.id=m.sender_id WHERE m.id=:id
                """).param("id", id).query(MessageView.class).single();
        messaging.convertAndSendToUser(recipient.email(), "/queue/messages", message);
        return message;
    }

    public record SendRequest(Long recipientId, @NotBlank String body) {}
    public record MessageView(Long id, Long senderId, String senderName, Long recipientId, String body,
                              OffsetDateTime sentAt) {}
    public record ContactView(Long id, String fullName, String email, String role) {}
}
