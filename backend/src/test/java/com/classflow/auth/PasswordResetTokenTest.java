package com.classflow.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Pins the property the password_reset_tokens table depends on: what is written to the
 * database is a digest, and the link that was emailed cannot be read back out of it.
 */
class PasswordResetTokenTest {
    private static final String TOKEN = "3Yk9Qm2Xb1LpR7sVwNhTd4FzJc0GaEu5Bi8OyKlMnPq";

    @Test
    void storesADigestRatherThanTheTokenItself() {
        var stored = PasswordResetService.digest(TOKEN);

        // A database dump must not hand a thief a working reset link for every request that
        // happens to be outstanding.
        assertThat(stored).doesNotContain(TOKEN);
        assertThat(stored).hasSize(64).matches("[0-9a-f]{64}");
    }

    @Test
    void theSameTokenAlwaysDigestsTheSameWay() {
        // Redeeming a link is a lookup by digest, so an unstable hash would mean no link ever
        // worked.
        assertThat(PasswordResetService.digest(TOKEN)).isEqualTo(PasswordResetService.digest(TOKEN));
    }

    @Test
    void differentTokensDigestDifferently() {
        assertThat(PasswordResetService.digest(TOKEN))
                .isNotEqualTo(PasswordResetService.digest(TOKEN.substring(0, TOKEN.length() - 1) + "r"));
    }
}
