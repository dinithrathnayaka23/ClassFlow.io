package com.classflow.mail;

import jakarta.annotation.PostConstruct;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

/**
 * Sends transactional mail, and copes with there being no mail server.
 *
 * Mail is deliberately not required for the application to run. A contributor cloning this
 * repository has no SMTP credentials, and a password reset they cannot receive would make the
 * whole flow untestable, so with no host configured the message is written to the log instead
 * of being sent. That fallback is loud on purpose: a deployment that quietly logged reset
 * links instead of mailing them would be a serious leak, so it names itself in the log line.
 *
 * Delivery runs off the request thread. Talking to an SMTP server takes as long as it takes,
 * and the caller's answer - a deliberately vague "if that address is registered, a link is on
 * its way" - does not depend on the result. Failures are logged rather than thrown for the
 * same reason: whether the address exists is exactly what the response must not reveal.
 */
@Component
public class Mailer {
    private static final Logger log = LoggerFactory.getLogger(Mailer.class);

    private final ObjectProvider<JavaMailSender> senders;
    private final String host;
    private final String port;
    private final String from;
    private final String fromName;

    public Mailer(ObjectProvider<JavaMailSender> senders,
                  @Value("${spring.mail.host:}") String host,
                  @Value("${spring.mail.port:}") String port,
                  @Value("${app.mail.from:}") String from,
                  @Value("${app.mail.from-name:ClassFlow}") String fromName) {
        this.senders = senders;
        this.host = host == null ? "" : host.trim();
        this.port = port == null ? "" : port.trim();
        this.from = from == null ? "" : from.trim();
        this.fromName = fromName;
    }

    /**
     * Says on startup which of the two modes this instance is in.
     *
     * Worth a line of its own because the difference is otherwise invisible until somebody
     * asks for a reset and no mail arrives - and at that point every explanation looks alike.
     * Seeing this in the log immediately after boot answers "did my SMTP settings reach the
     * server" without having to send anything.
     */
    @PostConstruct
    void reportConfiguration() {
        if (isConfigured()) {
            log.info("Mail is enabled: sending via {}:{} as {}", host, port, fromDescription());
        } else {
            log.warn("Mail is DISABLED because MAIL_HOST is not set. Messages, including password "
                    + "reset links, will be written to this log instead of being sent. "
                    + "This is for local development only - set MAIL_HOST on any deployment.");
        }
    }

    /** True when mail would actually leave the server, rather than being logged. */
    public boolean isConfigured() {
        // The host is checked as well as the bean because MAIL_HOST left empty in .env still
        // counts as "set" to the auto-configuration, which then builds a sender pointed at
        // nowhere. Treating a blank host as unconfigured keeps the log fallback working.
        return !host.isBlank() && senders.getIfAvailable() != null;
    }

    @Async
    public void send(String to, String subject, String html, String plainTextFallback) {
        if (!isConfigured()) {
            log.warn("""
                    No mail server is configured (MAIL_HOST is unset), so this message was not sent. \
                    It is printed here for local development only and must never appear in a \
                    deployed environment.
                    To: {}
                    Subject: {}
                    {}""", to, subject, plainTextFallback);
            return;
        }
        try {
            var sender = senders.getObject();
            MimeMessage message = sender.createMimeMessage();
            var helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            helper.setTo(to);
            helper.setSubject(subject);
            // Both parts are attached: HTML for the usual client, plain text for the ones that
            // refuse it, and because a text alternative keeps the message out of spam filters
            // that distrust HTML-only mail.
            helper.setText(plainTextFallback, html);
            helper.setFrom(fromAddress());
            sender.send(message);
            log.info("Sent \"{}\" to {}", subject, to);
        } catch (Exception failure) {
            // Never rethrown: the caller has already answered, and an SMTP fault is ours to
            // fix rather than something the person resetting their password can act on.
            log.error("Could not send \"{}\" to {}", subject, to, failure);
        }
    }

    /** The From that will be used, for the startup line. Never includes the credentials. */
    private String fromDescription() {
        return from.isBlank() ? "no-reply@" + host + " (MAIL_FROM is unset)" : from;
    }

    private InternetAddress fromAddress() throws UnsupportedEncodingException {
        // Falls back to the SMTP username's own address when MAIL_FROM is unset, which is what
        // most providers require anyway - they reject a From they do not own.
        var address = from.isBlank() ? "no-reply@" + host : from;
        return new InternetAddress(address, fromName, StandardCharsets.UTF_8.name());
    }
}
