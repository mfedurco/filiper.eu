package sk.vyprava.db;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PortalHeartbeatTest {
    @Test
    void successfulHeartbeatRunsOncePerMinuteWithoutPlayerData() throws Exception {
        PortalHeartbeat heartbeat = new PortalHeartbeat();
        AtomicInteger sent = new AtomicInteger();

        assertTrue(heartbeat.run(1_000, sent::incrementAndGet));
        assertFalse(heartbeat.run(60_999, sent::incrementAndGet));
        assertTrue(heartbeat.run(61_000, sent::incrementAndGet));
        assertEquals(2, sent.get());
    }

    @Test
    void failedHeartbeatBacksOffAndSuccessRestoresNormalInterval() throws Exception {
        PortalHeartbeat heartbeat = new PortalHeartbeat();
        PortalHeartbeat.Sender failing = () -> {
            throw new IOException("offline");
        };

        assertThrows(IOException.class, () -> heartbeat.run(0, failing));
        assertEquals(10_000, heartbeat.nextAttemptAt());
        assertEquals(20_000, heartbeat.retryDelayMillis());
        assertFalse(heartbeat.run(9_999, () -> {
            throw new AssertionError("not due");
        }));

        assertThrows(IOException.class, () -> heartbeat.run(10_000, failing));
        assertEquals(30_000, heartbeat.nextAttemptAt());
        assertEquals(40_000, heartbeat.retryDelayMillis());

        assertTrue(heartbeat.run(30_000, () -> { }));
        assertEquals(90_000, heartbeat.nextAttemptAt());
        assertEquals(10_000, heartbeat.retryDelayMillis());
    }
}
