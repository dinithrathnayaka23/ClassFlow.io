package com.classflow.ai;

/**
 * One upstream model vendor. Implementations must be side-effect free and must
 * throw on any failure so {@link AiService} can move on to the next provider.
 */
public interface AiProvider {
    /** Short identifier used in logs and in the API response. */
    String name();

    /** False when no API key is configured, in which case the provider is skipped entirely. */
    boolean configured();

    /**
     * @return the model's answer, never blank
     * @throws Exception on transport failure, a non-2xx status, or an unusable body
     */
    String complete(String systemPrompt, String question) throws Exception;
}
