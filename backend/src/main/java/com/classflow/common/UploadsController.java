package com.classflow.common;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Serves the public uploads - course materials, assignment briefs, profile photos.
 *
 * This replaces the static resource handler that used to map /uploads/** straight onto a
 * directory. Reading through FileStorage instead means the local disk and a bucket serve
 * these files identically, so moving a deployment between them changes nothing a browser
 * can see and no stored URL has to be rewritten.
 *
 * Privacy still comes from SecurityConfig, which denies /uploads/chat/** and
 * /uploads/submissions/** outright: those have their own endpoints that check who is asking.
 * That ordering is what keeps this controller from becoming a way around those checks.
 */
@RestController
public class UploadsController {
    private final FileStorage files;

    public UploadsController(FileStorage files) {
        this.files = files;
    }

    @GetMapping("/uploads/**")
    public ResponseEntity<Resource> serve(HttpServletRequest request) {
        var path = request.getRequestURI();
        var resource = files.read(path);
        var contentType = MediaTypeFactory.getMediaType(path).orElse(MediaType.APPLICATION_OCTET_STREAM);
        return ResponseEntity.ok()
                .contentType(contentType)
                // Stored names carry a UUID, so a given URL's content never changes.
                .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePublic())
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .body(resource);
    }
}
