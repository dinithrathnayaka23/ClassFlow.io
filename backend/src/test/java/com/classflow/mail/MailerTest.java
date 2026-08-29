package com.classflow.mail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Covers which transport Mailer picks. The choice is what decides whether a deployment sends
 * mail or silently logs it, and on a host that blocks SMTP it decides whether mail works at
 * all, so it is worth pinning rather than trusting to bean ordering.
 */
class MailerTest {
    @Test
    void prefersTheTransportListedFirst() {
        var brevo = new FakeTransport("brevo", true);
        var smtp = new FakeTransport("smtp", true);
        var mailer = new Mailer(List.of(smtp, brevo), "brevo,smtp");

        mailer.send("someone@example.com", "Subject", "<p>html</p>", "text");

        // Both are usable, so the order decides. On a host that blocks outbound SMTP the two
        // do not disagree about being configured - only about working - which is exactly why
        // the order is explicit rather than left to whichever bean Spring happens to hand over.
        assertThat(brevo.delivered).isEqualTo(1);
        assertThat(smtp.delivered).isZero();
    }

    @Test
    void fallsPastATransportThatIsNotConfigured() {
        var brevo = new FakeTransport("brevo", false);
        var smtp = new FakeTransport("smtp", true);
        var mailer = new Mailer(List.of(brevo, smtp), "brevo,smtp");

        mailer.send("someone@example.com", "Subject", "<p>html</p>", "text");

        assertThat(smtp.delivered).isEqualTo(1);
    }

    @Test
    void reportsItselfUnconfiguredWhenNothingCanSend() {
        var mailer = new Mailer(List.of(new FakeTransport("smtp", false)), "brevo,smtp");

        assertThat(mailer.isConfigured()).isFalse();
    }

    @Test
    void aTransportMissingFromTheOrderIsNeverUsed() {
        var brevo = new FakeTransport("brevo", true);
        // Only SMTP is listed, so a configured Brevo must stay untouched - otherwise a key
        // left in the environment would quietly override the transport that was asked for.
        var mailer = new Mailer(List.of(brevo), "smtp");

        assertThat(mailer.isConfigured()).isFalse();
        mailer.send("someone@example.com", "Subject", "<p>html</p>", "text");
        assertThat(brevo.delivered).isZero();
    }

    @Test
    void aFailedDeliveryIsSwallowed() {
        // The caller has already answered, and it answered without saying whether the address
        // exists. Throwing here could only undo that.
        var mailer = new Mailer(List.of(new FailingTransport()), "smtp");

        assertThatCode(() -> mailer.send("someone@example.com", "Subject", "<p>x</p>", "x"))
                .doesNotThrowAnyException();
    }

    private static class FakeTransport implements MailTransport {
        private final String name;
        private final boolean configured;
        private int delivered;

        FakeTransport(String name, boolean configured) {
            this.name = name;
            this.configured = configured;
        }

        @Override
        public String name() {
            return name;
        }

        @Override
        public boolean configured() {
            return configured;
        }

        @Override
        public String describe() {
            return name + " (test)";
        }

        @Override
        public void deliver(String to, String subject, String html, String text) {
            delivered++;
        }
    }

    private static class FailingTransport implements MailTransport {
        @Override
        public String name() {
            return "smtp";
        }

        @Override
        public boolean configured() {
            return true;
        }

        @Override
        public String describe() {
            return "always fails (test)";
        }

        @Override
        public void deliver(String to, String subject, String html, String text) {
            throw new IllegalStateException("nope");
        }
    }
}
