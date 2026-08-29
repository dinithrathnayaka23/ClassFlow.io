package com.classflow.mail;

import jakarta.mail.internet.InternetAddress;
import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

/** Sends over SMTP. The usual choice locally, where nothing blocks the port. */
@Component
public class SmtpMailTransport implements MailTransport {
    private final ObjectProvider<JavaMailSender> senders;
    private final String host;
    private final String port;
    private final String username;
    private final String from;
    private final String fromName;

    public SmtpMailTransport(ObjectProvider<JavaMailSender> senders,
                             @Value("${spring.mail.host:}") String host,
                             @Value("${spring.mail.port:}") String port,
                             @Value("${spring.mail.username:}") String username,
                             @Value("${app.mail.from:}") String from,
                             @Value("${app.mail.from-name:ClassFlow}") String fromName) {
        this.senders = senders;
        this.host = trim(host);
        this.port = trim(port);
        this.username = trim(username);
        this.from = trim(from);
        this.fromName = fromName;
    }

    @Override
    public String name() {
        return "smtp";
    }

    @Override
    public boolean configured() {
        // The host is checked as well as the bean because a blank MAIL_HOST still counts as
        // "set" to the auto-configuration, which then builds a sender pointed at nowhere.
        return !host.isBlank() && senders.getIfAvailable() != null;
    }

    @Override
    public String describe() {
        return "SMTP " + host + ":" + port + " as " + fromAddressText();
    }

    @Override
    public void deliver(String to, String subject, String html, String text) throws Exception {
        var sender = senders.getObject();
        var message = sender.createMimeMessage();
        var helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
        helper.setTo(to);
        helper.setSubject(subject);
        // Both parts are attached: HTML for the usual client, plain text for the ones that
        // refuse it, and because a text alternative keeps the message out of spam filters
        // that distrust HTML-only mail.
        helper.setText(text, html);
        helper.setFrom(fromAddress());
        sender.send(message);
    }

    /**
     * The From, falling back to the mailbox we authenticate as.
     *
     * That fallback matters: providers reject a From they do not own, so defaulting to
     * something like no-reply@smtp.gmail.com - an address Gmail has never heard of - produced
     * a guaranteed rejection whenever MAIL_FROM was left unset. The authenticated username is
     * always an address the provider will accept.
     */
    private String fromAddressText() {
        if (!from.isBlank()) return from;
        if (!username.isBlank()) return username;
        return "no-reply@" + host;
    }

    private InternetAddress fromAddress() throws UnsupportedEncodingException {
        return new InternetAddress(fromAddressText(), fromName, StandardCharsets.UTF_8.name());
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }
}
