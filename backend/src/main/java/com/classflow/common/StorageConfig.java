package com.classflow.common;

import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Chooses where uploads go.
 *
 * A configured bucket wins; otherwise files land on the local disk. Deciding on the bucket
 * name rather than on a separate mode flag removes a way to get it wrong - there is no state
 * where the app believes it is using S3 but has nothing to talk to, or vice versa.
 *
 * The choice is logged at startup, because "which store is this instance using" is the first
 * question anyone asks when a file cannot be found.
 */
@Configuration
public class StorageConfig {
    private static final Logger log = LoggerFactory.getLogger(StorageConfig.class);

    @Bean
    FileStorage fileStorage(
            @Value("${app.upload-dir}") String uploadDir,
            @Value("${app.storage.bucket:}") String bucket,
            @Value("${app.storage.endpoint:}") String endpoint,
            @Value("${app.storage.region:auto}") String region,
            @Value("${app.storage.access-key:}") String accessKey,
            @Value("${app.storage.secret-key:}") String secretKey) throws IOException {

        if (bucket == null || bucket.isBlank()) {
            var local = new LocalFileStorage(uploadDir);
            log.info("Uploads are stored on the local disk at {}", local.location());
            log.warn("Local disk storage does not survive a redeploy. Set S3_BUCKET when deploying.");
            return local;
        }

        if (accessKey.isBlank() || secretKey.isBlank()) {
            // Failing here beats accepting uploads that silently cannot be written.
            throw new IllegalStateException(
                    "S3_BUCKET is set but S3_ACCESS_KEY or S3_SECRET_KEY is missing");
        }
        var s3 = new S3FileStorage(bucket, endpoint, region, accessKey, secretKey);
        log.info("Uploads are stored in {}", s3.location());
        return s3;
    }
}
