package com.classflow.mail;

import jakarta.annotation.PostConstruct;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

/**
 * Sends transactional mail, and copes with there being no way to send it.
 *
 * Delivery itself belongs to a MailTransport; this class decides which one to use, keeps the
 * sending off the request thread, and defines what happens when there is no transport at all.
 *
 * That last case is deliberate rather than an oversight. A contributor cloning this repository
 * has no mail credentials of any kind, and a password reset they cannot receive would make the
 * whole flow untestable, so with nothing configured the message is written to the log instead
 * of being sent. The fallback is loud on purpose: a deployment that quietly logged reset links
 * rather than mailing them would be a serious leak, so it names itself in the log line and
 * again at startup.
 *
 * Failures are logged rather than thrown. The caller has already answered - with a
 * deliberately vague "if that address is registered, a link is on its way" - and whether the
 * address exists is exactly what the response must not reveal, so there is nothing useful to
 * propagate.
 */
@Component
public class Mailer {
    private static final Logger log = LoggerFactory.getLogger(Mailer.class);

    private final List<MailTransport> transports;
    private final List<String> order;

    public Mailer(List<MailTransport> transports, @Value("${app.mail.order:brevo,smtp}") String order) {
        this.transports = transports;
        this.order = Arrays.stream(order.split(",")).map(name -> name.trim().toLowerCase(Locale.ROOT))
                .filter(name -> !name.isBlank()).toList();
    }

    /**
     * Says on startup how this instance will send, if at all.
     *
     * Worth a line of its own because the difference is otherwise invisible until somebody
     * asks for a reset and no mail arrives - and at that point every explanation looks alike.
     * Seeing this immediately after boot answers "did my settings reach the server" without
     * having to send anything.
     */
    @PostConstruct
    void reportConfiguration() {
        active().ifPresentOrElse(
                transport -> log.info("Mail is enabled via {}: {}", transport.name(), transport.describe()),
                () -> log.warn("Mail is DISABLED - no transport is configured. Messages, including "
                        + "password reset links, will be written to this log instead of being sent. "
                        + "This is for local development only; configure one on any deployment. "
                        + "Set BREVO_API_KEY and MAIL_FROM to send over HTTPS, which is the option "
                        + "that works on hosts that block outbound SMTP, or MAIL_HOST for SMTP."));
    }

    /** True when mail would actually leave the server, rather than being logged. */
    public boolean isConfigured() {
        return active().isPresent();
    }

    /**
     * The first configured transport in the order given by app.mail.order.
     *
     * Order matters on a deployment that has both: the HTTP transport is listed first because
     * where the two disagree it is because SMTP is being blocked, and preferring the one that
     * works avoids every send failing on a timeout before anyone notices.
     */
    private Optional<MailTransport> active() {
        return order.stream()
                .flatMap(name -> transports.stream().filter(t -> t.name().equals(name)))
                .filter(MailTransport::configured)
                .findFirst();
    }

    @Async
    public void send(String to, String subject, String html, String plainTextFallback) {
        var transport = active().orElse(null);
        if (transport == null) {
            log.warn("""
                    No mail transport is configured, so this message was not sent. \
                    It is printed here for local development only and must never appear in a \
                    deployed environment.
                    To: {}
                    Subject: {}
                    {}""", to, subject, plainTextFallback);
            return;
        }
        try {
            transport.deliver(to, subject, html, plainTextFallback);
            log.info("Sent \"{}\" to {} via {}", subject, to, transport.name());
        } catch (Exception failure) {
            // Never rethrown: the caller has already answered, and a delivery fault is ours to
            // fix rather than something the person resetting their password can act on.
            log.error("Could not send \"{}\" to {} via {}", subject, to, transport.name(), failure);
        }
    }
}
