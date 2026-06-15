package com.classflow.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

class FileStorageTest {
    @TempDir
    Path tempDir;

    @Test
    void storesFileOutsideDatabaseAndReturnsPublicPath() throws Exception {
        var storage = new FileStorage(tempDir.toString());
        var file = new MockMultipartFile("file", "my answer.pdf", "application/pdf", "answer".getBytes());

        var stored = storage.save(file, "submissions");

        assertThat(stored.name()).isEqualTo("my answer.pdf");
        assertThat(stored.url()).startsWith("/uploads/submissions/");
        try (var files = Files.list(tempDir.resolve("submissions"))) {
            assertThat(files).hasSize(1);
        }
    }
}
