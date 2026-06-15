package com.classflow.common;

import java.time.Instant;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
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

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<?> denied(AccessDeniedException exception) {
        return ResponseEntity.status(403).body(error("You do not have permission to perform this action"));
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<?> authentication(AuthenticationException exception) {
        return ResponseEntity.status(401).body(error("Invalid email or password"));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<?> unexpected(Exception exception) {
        return ResponseEntity.internalServerError().body(error("Unexpected server error"));
    }

    private Map<String, Object> error(String message) {
        return Map.of("message", message, "timestamp", Instant.now());
    }
}
