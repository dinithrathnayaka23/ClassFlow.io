package com.classflow.common;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Path;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;

/**
 * Uploads held in an S3-compatible bucket, so they outlive the container that received them.
 *
 * Written against the plain S3 API rather than any one vendor's SDK, so Cloudflare R2,
 * Supabase Storage, MinIO and AWS all work with nothing but different environment values.
 *
 * The bucket stays private. Nothing here hands out a bucket URL: every file is read back
 * through this application, which is what lets the existing rules - only the two people in a
 * conversation may fetch a chat attachment, only the author and their teacher may fetch a
 * submission - keep applying. A public bucket would quietly route around all of them.
 */
public class S3FileStorage implements FileStorage {
    private static final Logger log = LoggerFactory.getLogger(S3FileStorage.class);

    private final S3Client client;
    private final String bucket;
    private final String describedAs;

    public S3FileStorage(String bucket, String endpoint, String region, String accessKey, String secretKey) {
        this.bucket = bucket;
        this.describedAs = endpoint == null || endpoint.isBlank() ? "s3://" + bucket : endpoint + "/" + bucket;
        var builder = S3Client.builder()
                // java.net.http rather than Netty: far less memory on a small instance.
                .httpClient(UrlConnectionHttpClient.builder().build())
                .region(Region.of(region == null || region.isBlank() ? "auto" : region))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(accessKey, secretKey)));
        if (endpoint != null && !endpoint.isBlank()) {
            // Path-style addressing: R2 and MinIO do not serve virtual-host style buckets.
            builder.endpointOverride(URI.create(endpoint)).forcePathStyle(true);
        }
        this.client = builder.build();
    }

    @Override
    public StoredFile save(MultipartFile file, String folder) {
        if (file == null || file.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "A file is required");
        var original = Path.of(file.getOriginalFilename() == null ? "upload.bin" : file.getOriginalFilename())
                .getFileName().toString();
        var safeName = UUID.randomUUID() + "-" + original.replaceAll("[^a-zA-Z0-9._-]", "_");
        var key = folder + "/" + safeName;
        try (var stream = file.getInputStream()) {
            client.putObject(PutObjectRequest.builder()
                            .bucket(bucket).key(key)
                            .contentType(file.getContentType())
                            .build(),
                    // Length is given so the SDK streams rather than buffering the whole file.
                    RequestBody.fromInputStream(stream, file.getSize()));
            return new StoredFile(original, PUBLIC_PREFIX + key);
        } catch (IOException | S3Exception failure) {
            log.error("Could not store {} in {}", key, describedAs, failure);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not store uploaded file");
        }
    }

    @Override
    public void delete(String url) {
        var key = FileStorage.keyOf(url);
        if (key == null) return;
        try {
            client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
        } catch (S3Exception failure) {
            log.warn("Could not delete stored file {}", url, failure);
        }
    }

    @Override
    public Resource read(String url) {
        var key = FileStorage.keyOf(url);
        if (key == null) throw new ApiException(HttpStatus.NOT_FOUND, "That file is no longer available");
        try {
            var object = client.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build());
            return new InputStreamResource(object);
        } catch (NoSuchKeyException missing) {
            throw new ApiException(HttpStatus.NOT_FOUND, "That file is no longer available");
        } catch (S3Exception failure) {
            log.error("Could not read {} from {}", key, describedAs, failure);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not read the stored file");
        }
    }

    @Override
    public String location() {
        return describedAs;
    }
}
