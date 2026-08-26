package com.classflow.common;

import java.time.Instant;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Turns exceptions into the {message, timestamp} shape the web client reads.
 *
 * The ordering principle here is that the catch-all must only ever see faults that really are
 * ours. Anything the caller could correct - a bad body, an unknown path, a wrong method - gets
 * its own handler and its own status, because reporting those as 500 sends people looking for
 * a server bug that does not exist.
 */
@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<?> api(ApiException exception) {
        return ResponseEntity.status(exception.status()).body(error(exception.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<?> validation(MethodArgumentNotValidException exception) {
        var message = exception.getBindingResult().getFieldErrors().stream()
                .findFirst().map(e -> e.getField() + ": " + e.getDefaultMessage()).orElse("Invalid request");
        return ResponseEntity.badRequest().body(error(message));
    }

    /** A body that is not valid JSON, or whose types do not fit. The caller's mistake, not ours. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<?> unreadable(HttpMessageNotReadableException exception) {
        return ResponseEntity.badRequest().body(error("The request body could not be read. Expected valid JSON."));
    }

    /**
     * No handler is mapped to this path. Most often the client is newer than the running
     * server, so the message says so rather than implying the request itself was malformed.
     */
    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<?> notFound(NoResourceFoundException exception) {
        log.warn("No endpoint for {} {}", exception.getHttpMethod(), exception.getResourcePath());
        return ResponseEntity.status(404).body(error("No such endpoint: " + exception.getHttpMethod() + " /"
                + exception.getResourcePath() + ". The server may be running an older build than the client."));
    }

    /**
     * The path exists but not for this verb.
     *
     * This is also what a client newer than the server hits when its new path happens to
     * match an older route's pattern - POST /messages/attachment falling onto a
     * GET /messages/{id} that was written before it. The hint is worth repeating here for
     * the same reason as on the 404: the alternative is a puzzling verb complaint about an
     * endpoint the caller knows perfectly well is a POST.
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<?> methodNotAllowed(HttpRequestMethodNotSupportedException exception) {
        var allowed = exception.getSupportedHttpMethods();
        log.warn("{} not supported for this path; supported methods are {}", exception.getMethod(), allowed);
        return ResponseEntity.status(405).body(error(exception.getMethod() + " is not supported here."
                + (allowed == null || allowed.isEmpty() ? "" : " This path accepts " + allowed + ".")
                + " If the client expects this to work, the server may be running an older build."));
    }

    /**
     * An upload that could not be read: over the configured size limit, or a spool to disk
     * that failed. Reporting the limit is more useful than a bare 500, and a failure to
     * store is worth naming because the usual cause is the server running out of disk.
     */
    @ExceptionHandler(MultipartException.class)
    ResponseEntity<?> upload(MultipartException exception) {
        if (exception instanceof MaxUploadSizeExceededException) {
            return ResponseEntity.status(413).body(error("That file is too large to upload."));
        }
        log.error("Upload could not be processed", exception);
        return ResponseEntity.status(500).body(error(
                "The upload could not be saved. If this keeps happening the server may be out of disk space."));
    }

    /**
     * A unique or foreign key the request violated. These are user-correctable - a course code
     * that is taken, a row still referenced elsewhere - so they are a 409, not a server fault.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<?> conflict(DataIntegrityViolationException exception) {
        return ResponseEntity.status(409).body(error("That change conflicts with existing data. "
                + "Check for a duplicate code or email, or for records that still reference this item."));
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<?> denied(AccessDeniedException exception) {
        return ResponseEntity.status(403).body(error("You do not have permission to perform this action"));
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<?> authentication(AuthenticationException exception) {
        return ResponseEntity.status(401).body(error("Invalid email or password"));
    }

    /**
     * A genuine fault. The response stays deliberately vague so it leaks nothing, but the
     * stack trace is logged: a 500 that leaves no trace anywhere is impossible to diagnose.
     */
    @ExceptionHandler(Exception.class)
    ResponseEntity<?> unexpected(Exception exception) {
        log.error("Unhandled exception serving request", exception);
        return ResponseEntity.internalServerError().body(error("Unexpected server error"));
    }

    private Map<String, Object> error(String message) {
        return Map.of("message", message, "timestamp", Instant.now());
    }
}
