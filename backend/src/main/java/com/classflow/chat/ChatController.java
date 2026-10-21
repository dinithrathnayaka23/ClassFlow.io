package com.classflow.chat;

import com.classflow.common.ApiException;
import com.classflow.common.FileStorage;
import com.classflow.security.CurrentUser;
import com.classflow.security.UserPrincipal;
import com.classflow.user.UserRepository;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/chat")
public class ChatController {
    /** Generous enough for a photo or a short recording, and within the 20 MB multipart cap. */
    private static final long MAX_ATTACHMENT_BYTES = 15L * 1024 * 1024;
    /** Voice notes are capped so a stuck recorder cannot upload an hour of silence. */
    private static final int MAX_VOICE_SECONDS = 10 * 60;
    /** Every chat event for a user travels on this one queue; see ChatEvent. */
    private static final String QUEUE = "/queue/chat";
    /** The STOMP header a socket send uses to recognise its own echo. */
    private static final String CLIENT_ID = "client-id";
    private static final Logger log = LoggerFactory.getLogger(ChatController.class);

    private static final String MESSAGE_COLUMNS = """
            m.id, m.sender_id, sender.full_name AS sender_name, m.recipient_id, m.body, m.sent_at, m.read_at,
            m.attachment_name, m.attachment_type, m.attachment_size, m.attachment_duration_seconds
            """;

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final UserRepository users;
    private final SimpMessagingTemplate messaging;
    private final FileStorage files;
    private final ChatTicketService tickets;

    public ChatController(JdbcClient jdbc, CurrentUser currentUser, UserRepository users,
                          SimpMessagingTemplate messaging, FileStorage files, ChatTicketService tickets) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.users = users;
        this.messaging = messaging;
        this.files = files;
        this.tickets = tickets;
    }

    /**
     * Who this user may start a conversation with.
     *
     * Teachers and students reach each other only through a shared course: a student sees a
     * teacher once they enrol on one of that teacher's courses, and not before. The admin is
     * always reachable by everyone, which is what stops a student with no courses yet from
     * having nobody to ask. Peer-to-peer chat between two students is not offered.
     *
     * You never appear in your own contact list, which also stops a second admin's list
     * from offering them a conversation with themselves.
     */
    @GetMapping("/contacts")
    public List<ContactView> contacts(Authentication authentication) {
        var user = currentUser.require(authentication);
        return jdbc.sql("""
                SELECT u.id, u.full_name, u.email, u.role,
                       (SELECT COUNT(*) FROM chat_messages m
                          WHERE m.sender_id=u.id AND m.recipient_id=:me AND m.read_at IS NULL) AS unread,
                       last.body AS last_message,
                       last.attachment_type AS last_attachment_type,
                       last.sent_at AS last_message_at
                FROM users u
                LEFT JOIN LATERAL (
                    SELECT m.body, m.attachment_type, m.sent_at FROM chat_messages m
                    WHERE (m.sender_id=u.id AND m.recipient_id=:me) OR (m.sender_id=:me AND m.recipient_id=u.id)
                    ORDER BY m.sent_at DESC LIMIT 1
                ) last ON TRUE
                WHERE u.active AND u.id <> :me AND (%s)
                ORDER BY last.sent_at DESC NULLS LAST, u.full_name
                """.formatted(reachablePredicate(user.role())))
                .param("me", user.id()).query(ContactView.class).list();
    }

    /**
     * The message-count badge in the sidebar. Read once when the page loads and again whenever
     * the socket reconnects; in between, every change to it arrives as an UNREAD event.
     */
    @GetMapping("/unread")
    public Map<String, Long> unread(Authentication authentication) {
        return Map.of("total", unreadTotal(currentUser.require(authentication).id()));
    }

    /** A one-minute, single-use pass for the STOMP CONNECT frame - see ChatTicketService. */
    @PostMapping("/socket-ticket")
    public Map<String, String> socketTicket(Authentication authentication) {
        return Map.of("ticket", tickets.issue(currentUser.require(authentication).email()));
    }

    @GetMapping("/messages/{otherId}")
    public List<MessageView> history(@PathVariable Long otherId, Authentication authentication) {
        var user = currentUser.require(authentication);
        return jdbc.sql("""
                SELECT %s
                FROM chat_messages m JOIN users sender ON sender.id=m.sender_id
                WHERE (m.sender_id=:me AND m.recipient_id=:other) OR (m.sender_id=:other AND m.recipient_id=:me)
                ORDER BY m.sent_at
                """.formatted(MESSAGE_COLUMNS))
                .param("me", user.id()).param("other", otherId).query(MessageView.class).list();
    }

    /**
     * Marks everything the other person sent as read, which is what clears their badge.
     * Only the recipient's own rows are touched, so this cannot forge a read receipt.
     *
     * Both sides hear about it: the reader's other tabs clear the badge, and the sender's
     * ticks turn to read without waiting for anything to refresh.
     */
    @PostMapping("/messages/{otherId}/read")
    public Map<String, Integer> markRead(@PathVariable Long otherId, Authentication authentication) {
        var user = currentUser.require(authentication);
        var readAt = jdbc.sql("""
                UPDATE chat_messages SET read_at=NOW()
                WHERE recipient_id=:me AND sender_id=:other AND read_at IS NULL
                RETURNING read_at
                """).param("me", user.id()).param("other", otherId).query(OffsetDateTime.class).list();
        if (!readAt.isEmpty()) {
            push(user.email(), ChatEvent.read(otherId));
            push(user.email(), ChatEvent.unread(unreadTotal(user.id())));
            push(users.require(otherId).email(), ChatEvent.seen(user.id(), readAt.get(0)));
        }
        return Map.of("marked", readAt.size());
    }

    /** The fallback for a client whose socket is down; a connected client sends over STOMP. */
    @PostMapping("/messages")
    public MessageView sendRest(@Valid @RequestBody SendRequest request, Authentication authentication) {
        return deliver(currentUser.require(authentication), request.recipientId(), requireBody(request.body()),
                null, null);
    }

    /**
     * Sends a photo, a file or a voice note, with an optional caption alongside it.
     *
     * The stored kind is decided from the content type rather than the filename, so a photo
     * renders inline and a recording gets a player without trusting what the client claims.
     */
    @PostMapping(value = "/messages/attachment", consumes = "multipart/form-data")
    public MessageView sendAttachment(@RequestParam Long recipientId,
                                      @RequestParam(required = false) String body,
                                      @RequestParam(required = false) Integer durationSeconds,
                                      @RequestPart MultipartFile file,
                                      Authentication authentication) {
        var user = currentUser.require(authentication);
        if (file.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "Choose a file to send");
        if (file.getSize() > MAX_ATTACHMENT_BYTES) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Attachments must be 15 MB or smaller");
        }
        var kind = kindOf(file.getContentType());
        if ("AUDIO".equals(kind) && durationSeconds != null
                && (durationSeconds < 0 || durationSeconds > MAX_VOICE_SECONDS)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Voice messages can be up to 10 minutes long");
        }
        var stored = files.save(file, "chat");
        var attachment = new Attachment(stored.url(), stored.name(), kind, file.getSize(),
                file.getContentType(), "AUDIO".equals(kind) ? durationSeconds : null);
        return deliver(user, recipientId, body == null ? "" : body.trim(), attachment, null);
    }

    /**
     * Streams an attachment to one of the two people in the conversation.
     *
     * Chat files are excluded from the public /uploads path precisely so that this check is
     * unavoidable: knowing the URL is not enough, you have to be in the conversation.
     */
    @GetMapping("/attachments/{messageId}")
    public ResponseEntity<?> attachment(@PathVariable Long messageId, Authentication authentication) {
        var user = currentUser.require(authentication);
        var row = jdbc.sql("""
                SELECT attachment_url, attachment_name, attachment_type, attachment_content_type
                FROM chat_messages
                WHERE id=:id AND (sender_id=:me OR recipient_id=:me) AND attachment_url IS NOT NULL
                """).param("id", messageId).param("me", user.id()).query(AttachmentRow.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attachment not found"));

        // Images and audio play in place; anything else is offered as a download. The stored
        // kind came from the content type the sender's browser claimed, so it decides how a
        // file is rendered but is not trusted to prove what the file is: an SVG is an image
        // that can carry script, and this endpoint answers on the application's own origin,
        // so rendering one in place would run that script with the recipient's session.
        var type = mediaType(row.attachmentContentType());
        var inline = ("IMAGE".equals(row.attachmentType()) || "AUDIO".equals(row.attachmentType()))
                && !SCRIPTABLE_TYPES.contains(type.getType() + "/" + type.getSubtype());
        var disposition = (inline ? ContentDisposition.inline() : ContentDisposition.attachment())
                .filename(row.attachmentName(), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                // Without this a browser may sniff past the type below and execute the file anyway.
                .header("X-Content-Type-Options", "nosniff")
                .contentType(type)
                .body(files.read(row.attachmentUrl()));
    }

    /**
     * A text message sent over the socket. The client tags it with a client-id header; the
     * MESSAGE event echoed back to the sender carries the same id, and so does the ERROR event
     * if it is refused, which is how the sending tab knows which of its sends either refers to.
     */
    @MessageMapping("/chat.send")
    public void sendSocket(SendRequest request, Principal principal, SimpMessageHeaderAccessor headers) {
        // SocketAuthInterceptor refuses an anonymous CONNECT, so this is a second line rather
        // than the first; it also catches an account disabled after its socket was opened.
        var sender = Optional.ofNullable(principal)
                .flatMap(found -> users.findPrincipalByEmail(found.getName()))
                .filter(UserPrincipal::active)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Authentication required"));
        deliver(sender, request.recipientId(), requireBody(request.body()), null,
                headers.getFirstNativeHeader(CLIENT_ID));
    }

    /**
     * Reports a refused socket send to the session that made it - and only that session, so a
     * second tab is not shown an error for something it did not do. Without this the sender
     * would hear nothing back and could only wait for a confirmation that never comes.
     */
    @MessageExceptionHandler
    @SendToUser(destinations = QUEUE, broadcast = false)
    public ChatEvent socketFailure(Exception failure, SimpMessageHeaderAccessor headers) {
        var message = failure instanceof ApiException ? failure.getMessage() : "Could not send the message";
        if (!(failure instanceof ApiException)) log.error("Socket send failed", failure);
        return ChatEvent.error(headers.getFirstNativeHeader(CLIENT_ID), message);
    }

    private String requireBody(String body) {
        var trimmed = body == null ? "" : body.trim();
        if (trimmed.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "Write a message before sending");
        return trimmed;
    }

    private long unreadTotal(Long userId) {
        return jdbc.sql("SELECT COUNT(*) FROM chat_messages WHERE recipient_id=:me AND read_at IS NULL")
                .param("me", userId).query(Long.class).single();
    }

    /** Addressed by email because that is the name the socket's principal carries. */
    private void push(String email, ChatEvent event) {
        messaging.convertAndSendToUser(email, QUEUE, event);
    }

    /**
     * The one place a message row is written, whichever transport carried it in, and so the one
     * place that tells both people about it. The sender is told too: their other tabs show the
     * message, and the tab that sent it over the socket learns it was stored.
     */
    private MessageView deliver(UserPrincipal sender, Long recipientId, String body, Attachment attachment,
                                String clientId) {
        if (recipientId == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Choose who to send this to");
        if (recipientId.equals(sender.id())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot message yourself");
        }
        var senderId = sender.id();
        var recipient = users.require(recipientId);
        requireReachable(senderId, recipient);
        var id = jdbc.sql("""
                INSERT INTO chat_messages(sender_id, recipient_id, body, attachment_url, attachment_name,
                                          attachment_type, attachment_size, attachment_content_type,
                                          attachment_duration_seconds)
                VALUES (:sender, :recipient, :body, :url, :name, :type, :size, :contentType, :duration)
                RETURNING id
                """).param("sender", senderId).param("recipient", recipient.id()).param("body", body)
                .param("url", attachment == null ? null : attachment.url())
                .param("name", attachment == null ? null : attachment.name())
                .param("type", attachment == null ? null : attachment.type())
                .param("size", attachment == null ? null : attachment.size())
                .param("contentType", attachment == null ? null : attachment.contentType())
                .param("duration", attachment == null ? null : attachment.durationSeconds())
                .query(Long.class).single();
        var message = get(id);
        push(recipient.email(), ChatEvent.message(message, null));
        push(recipient.email(), ChatEvent.unread(unreadTotal(recipient.id())));
        push(sender.email(), ChatEvent.message(message, clientId));
        return message;
    }

    /**
     * Applies the same pairing rule to sending as to the contact list. Without this, the
     * contact list would be the only thing stopping a student messaging a teacher whose
     * course they never joined.
     */
    private void requireReachable(Long senderId, UserPrincipal recipient) {
        var sender = users.require(senderId);
        var allowed = jdbc.sql("""
                SELECT EXISTS(SELECT 1 FROM users u WHERE u.id=:other AND u.active AND (%s))
                """.formatted(reachablePredicate(sender.role())))
                .param("me", senderId).param("other", recipient.id()).query(Boolean.class).single();
        if (!allowed) {
            throw new ApiException(HttpStatus.FORBIDDEN, "You cannot start a conversation with this person");
        }
    }

    /**
     * The single definition of who may talk to whom, as a SQL predicate over a candidate row
     * {@code u} and the caller {@code :me}. Listing contacts and authorising a send both use
     * it, so the two can never disagree about who is reachable.
     *
     * The shared course must be active: archiving a course withdraws it from the student's
     * workspace, and the conversation it justified goes with it.
     */
    private String reachablePredicate(String role) {
        return switch (role) {
            case "STUDENT" -> """
                    u.role = 'ADMIN' OR (u.role = 'TEACHER' AND EXISTS (
                        SELECT 1 FROM courses c
                        JOIN course_enrollments e ON e.course_id = c.id
                        WHERE c.active AND e.status = 'APPROVED'
                          AND c.teacher_id = u.id AND e.student_id = :me))""";
            case "TEACHER" -> """
                    u.role = 'ADMIN' OR (u.role = 'STUDENT' AND EXISTS (
                        SELECT 1 FROM courses c
                        JOIN course_enrollments e ON e.course_id = c.id
                        WHERE c.active AND e.status = 'APPROVED'
                          AND c.teacher_id = :me AND e.student_id = u.id))""";
            // An admin is the escalation path for everyone, so reaches every account.
            default -> "TRUE";
        };
    }

    /**
     * The stored media type, falling back to a generic download for rows that predate the
     * column or carry something unparseable.
     */
    private MediaType mediaType(String contentType) {
        if (contentType == null || contentType.isBlank()) return MediaType.APPLICATION_OCTET_STREAM;
        try {
            return MediaType.parseMediaType(contentType);
        } catch (InvalidMediaTypeException invalid) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }

    /** Image and audio types a browser will execute rather than simply render. */
    private static final java.util.Set<String> SCRIPTABLE_TYPES =
            java.util.Set.of("image/svg+xml", "image/svg");

    /** IMAGE and AUDIO get rich rendering; everything else is a file card. */
    private String kindOf(String contentType) {
        var type = contentType == null ? "" : contentType.toLowerCase(Locale.ROOT);
        if (type.startsWith("image/")) return "IMAGE";
        if (type.startsWith("audio/") || type.startsWith("video/webm")) return "AUDIO";
        return "FILE";
    }

    private MessageView get(Long id) {
        return jdbc.sql("""
                SELECT %s FROM chat_messages m JOIN users sender ON sender.id=m.sender_id WHERE m.id=:id
                """.formatted(MESSAGE_COLUMNS)).param("id", id).query(MessageView.class).single();
    }

    private record Attachment(String url, String name, String type, Long size, String contentType,
                              Integer durationSeconds) {}
    private record AttachmentRow(String attachmentUrl, String attachmentName, String attachmentType,
                                 String attachmentContentType) {}

    public record SendRequest(Long recipientId, String body) {}

    /**
     * A message as the client sees it. The stored path is deliberately absent: attachments are
     * fetched by message id through the authorised endpoint, never by their location on disk.
     */
    public record MessageView(Long id, Long senderId, String senderName, Long recipientId, String body,
                              OffsetDateTime sentAt, OffsetDateTime readAt, String attachmentName,
                              String attachmentType, Long attachmentSize, Integer attachmentDurationSeconds) {}

    public record ContactView(Long id, String fullName, String email, String role, long unread,
                              String lastMessage, String lastAttachmentType, OffsetDateTime lastMessageAt) {}
}
