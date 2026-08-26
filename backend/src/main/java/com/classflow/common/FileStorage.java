package com.classflow.common;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Collection;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
public class FileStorage {
    private static final Logger log = LoggerFactory.getLogger(FileStorage.class);
    /** Matches the prefix that save() builds, and that WebConfig serves. */
    private static final String PUBLIC_PREFIX = "/uploads/";

    private final Path root;

    public FileStorage(@Value("${app.upload-dir}") String uploadDir) throws IOException {
        this.root = Path.of(uploadDir).toAbsolutePath().normalize();
        Files.createDirectories(root);
    }

    public StoredFile save(MultipartFile file, String folder) {
        if (file == null || file.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "A file is required");
        var original = Path.of(file.getOriginalFilename() == null ? "upload.bin" : file.getOriginalFilename())
                .getFileName().toString();
        var safeName = UUID.randomUUID() + "-" + original.replaceAll("[^a-zA-Z0-9._-]", "_");
        var directory = root.resolve(folder).normalize();
        var destination = directory.resolve(safeName).normalize();
        if (!destination.startsWith(root)) throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid file path");
        try {
            Files.createDirectories(directory);
            Files.copy(file.getInputStream(), destination, StandardCopyOption.REPLACE_EXISTING);
            return new StoredFile(original, PUBLIC_PREFIX + folder + "/" + safeName);
        } catch (IOException exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not store uploaded file");
        }
    }

    /**
     * Deletes a file previously returned by {@link #save}, addressed by its public URL.
     *
     * Anything that is not one of our own "/uploads/..." paths is ignored, so an external
     * material link is never mistaken for a stored file. Deletion is best effort: a file
     * that is already gone, or that the OS will not release, must not fail the database
     * change that prompted the cleanup.
     */
    public void delete(String url) {
        var path = resolve(url);
        if (path == null) return;
        try {
            Files.deleteIfExists(path);
        } catch (IOException exception) {
            log.warn("Could not delete stored file {}", url, exception);
        }
    }

    /** Convenience for the cascade cleanups, which collect URLs before deleting rows. */
    public void deleteAll(Collection<String> urls) {
        urls.forEach(this::delete);
    }

    /**
     * Opens a stored file for reading, for content that must not be served straight off the
     * static path - chat attachments, which only the two participants may fetch.
     */
    public Resource read(String url) {
        var path = resolve(url);
        if (path == null || !Files.isRegularFile(path)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "That file is no longer available");
        }
        return new FileSystemResource(path);
    }

    /** The absolute path for a stored URL, or null when the URL is not ours to delete. */
    private Path resolve(String url) {
        if (url == null || !url.startsWith(PUBLIC_PREFIX)) return null;
        var relative = url.substring(PUBLIC_PREFIX.length());
        if (relative.isBlank()) return null;
        var path = root.resolve(relative).normalize();
        // Refuses "/uploads/../..." style paths, which would otherwise escape the root.
        return path.startsWith(root) ? path : null;
    }

    public String location() {
        return root.toUri().toString();
    }

    public record StoredFile(String name, String url) {}
}
