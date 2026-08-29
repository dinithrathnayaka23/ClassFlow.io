package com.classflow.mail;

/**
 * One way of getting a message off this server.
 *
 * There are two because hosting platforms commonly block outbound SMTP. Render drops
 * connections to port 587 entirely, so a perfectly correct set of Gmail credentials fails
 * there with a connect timeout and no amount of reconfiguring the SMTP client helps. An HTTP
 * API reaches the same mail provider over 443, which is never blocked.
 *
 * SMTP is kept because it is the easier thing to run locally - a throwaway MailHog, or the
 * Gmail account a contributor already has - and because nothing blocks it on a developer
 * machine. Deployments use the HTTP transport.
 *
 * Implementations must throw on any failure so Mailer can report it; they must never swallow
 * one and report success.
 */
public interface MailTransport {
    /** Short identifier, used in configuration order and in logs. */
    String name();

    /** False when this transport has no usable configuration, in which case it is skipped. */
    boolean configured();

    /** How this transport will send, for the line Mailer logs at startup. No credentials. */
    String describe();

    /**
     * @throws Exception on transport failure, a non-2xx status, or a rejection by the provider
     */
    void deliver(String to, String subject, String html, String text) throws Exception;
}
