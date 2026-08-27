package com.classflow.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

class FileStorageDeleteTest {
    @Test
    void deletesAFilePreviouslySaved(@TempDir Path root) throws IOException {
        var storage = new LocalFileStorage(root.toString());
        var stored = storage.save(new MockMultipartFile("file", "notes.pdf", "application/pdf", "hello".getBytes()),
                "materials");
        var onDisk = root.resolve(stored.url().substring("/uploads/".length()));
        assertThat(onDisk).exists();

        storage.delete(stored.url());

        assertThat(onDisk).doesNotExist();
    }

    @Test
    void ignoresUrlsThatAreNotStoredFiles(@TempDir Path root) throws IOException {
        var storage = new LocalFileStorage(root.toString());

        // An external material link, a null column and a missing file must all be no-ops
        // rather than failures: cleanup runs after the database change has committed.
        assertThatCode(() -> storage.deleteAll(
                List.of("https://example.com/video", "/uploads/materials/never-existed.pdf")))
                .doesNotThrowAnyException();
        assertThatCode(() -> storage.delete(null)).doesNotThrowAnyException();
    }

    @Test
    void refusesToEscapeTheUploadRoot(@TempDir Path root) throws IOException {
        var outside = Files.writeString(root.resolve("secret.txt"), "keep me");
        var storage = new LocalFileStorage(root.resolve("uploads").toString());

        storage.delete("/uploads/../secret.txt");

        assertThat(outside).exists();
    }
}
