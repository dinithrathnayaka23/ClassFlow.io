package com.classflow.common;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
public class FileStorage {
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
            return new StoredFile(original, "/uploads/" + folder + "/" + safeName);
        } catch (IOException exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not store uploaded file");
        }
    }

    public String location() {
        return root.toUri().toString();
    }

    public record StoredFile(String name, String url) {}
}
