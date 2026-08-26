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
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
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

    private static final String MESSAGE_COLUMNS = """
            m.id, m.sender_id, sender.full_name AS sender_name, m.recipient_id, m.body, m.sent_at, m.read_at,
            m.attachment_name, m.attachment_type, m.attachment_size, m.attachment_duration_seconds
            """;

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final UserRepository users;
    private final SimpMessagingTemplate messaging;
    private final FileStorage files;

    public ChatController(JdbcClient jdbc, CurrentUser currentUser, UserRepository users,
                          SimpMessagingTemplate messaging, FileStorage files) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.users = users;
        this.messaging = messaging;
        this.files = files;
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

    /** Drives the message-count badge in the sidebar, so it stays cheap enough to poll. */
    @GetMapping("/unread")
    public Map<String, Long> unread(Authentication authentication) {
        var user = currentUser.require(authentication);
        var total = jdbc.sql("SELECT COUNT(*) FROM chat_messages WHERE recipient_id=:me AND read_at IS NULL")
                .param("me", user.id()).query(Long.class).single();
        return Map.of("total", total);
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
     */
    @PostMapping("/messages/{otherId}/read")
    public Map<String, Integer> markRead(@PathVariable Long otherId, Authentication authentication) {
        var user = currentUser.require(authentication);
        var updated = jdbc.sql("""
                UPDATE chat_messages SET read_at=NOW()
                WHERE recipient_id=:me AND sender_id=:other AND read_at IS NULL
                """).param("me", user.id()).param("other", otherId).update();
        return Map.of("marked", updated);
    }

    @PostMapping("/messages")
    public MessageView sendRest(@Valid @RequestBody SendRequest request, Authentication authentication) {
        var body = request.body() == null ? "" : request.body().trim();
        if (body.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "Write a message before sending");
        return deliver(currentUser.require(authentication).id(), request.recipientId(), body, null);
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
        return deliver(user.id(), recipientId, body == null ? "" : body.trim(), attachment);
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

        // Images and audio play in place; anything else is offered as a download.
        var inline = "IMAGE".equals(row.attachmentType()) || "AUDIO".equals(row.attachmentType());
        var disposition = (inline ? ContentDisposition.inline() : ContentDisposition.attachment())
                .filename(row.attachmentName(), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentType(mediaType(row.attachmentContentType()))
                .body(files.read(row.attachmentUrl()));
    }

    @MessageMapping("/chat.send")
    public void sendSocket(SendRequest request, Principal principal) {
        var sender = users.findPrincipalByEmail(principal.getName())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Authentication required"));
        var body = request.body() == null ? "" : request.body().trim();
        if (!body.isEmpty()) deliver(sender.id(), request.recipientId(), body, null);
    }

    /** The one place a message row is written, whichever transport carried it in. */
    private MessageView deliver(Long senderId, Long recipientId, String body, Attachment attachment) {
        if (recipientId == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Choose who to send this to");
        if (recipientId.equals(senderId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot message yourself");
        }
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
        messaging.convertAndSendToUser(recipient.email(), "/queue/messages", message);
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
