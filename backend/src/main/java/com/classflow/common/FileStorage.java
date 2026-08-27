package com.classflow.common;

import java.util.Collection;
import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

/**
 * Where uploaded files live.
 *
 * Two implementations back this: the local disk for development, and any S3-compatible bucket
 * for deployment. The distinction matters because hosted containers have ephemeral disks - a
 * redeploy wipes them - so anything a student hands in has to live outside the container.
 *
 * Callers never know which is in use. Both return the same "/uploads/..." URL shape, so the
 * value stored in the database is identical either way and a deployment can move between them
 * without rewriting a single row.
 */
public interface FileStorage {
    /** Matches the prefix save() builds, and that UploadsController serves. */
    String PUBLIC_PREFIX = "/uploads/";

    StoredFile save(MultipartFile file, String folder);

    /**
     * Deletes a file previously returned by {@link #save}, addressed by its public URL.
     *
     * Anything that is not one of our own "/uploads/..." paths is ignored, so an external
     * material link is never mistaken for a stored file. Deletion is best effort: a file that
     * is already gone must not fail the database change that prompted the cleanup.
     */
    void delete(String url);

    /** Convenience for the cascade cleanups, which collect URLs before deleting rows. */
    default void deleteAll(Collection<String> urls) {
        urls.forEach(this::delete);
    }

    /** Opens a stored file for reading, for content served through an authorised endpoint. */
    Resource read(String url);

    /** Human-readable description of the backing store, for the startup log. */
    String location();

    /**
     * The part of a public URL that identifies the object: "materials/abc.pdf". Null when the
     * URL is not one of ours, which is how an external link is told apart from a stored file.
     */
    static String keyOf(String url) {
        if (url == null || !url.startsWith(PUBLIC_PREFIX)) return null;
        var key = url.substring(PUBLIC_PREFIX.length());
        // Refuses "/uploads/../..." style paths before they reach a filesystem or a bucket.
        if (key.isBlank() || key.contains("..")) return null;
        return key;
    }

    record StoredFile(String name, String url) {}
}
