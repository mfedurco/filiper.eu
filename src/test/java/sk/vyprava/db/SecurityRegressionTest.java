package sk.vyprava.db;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SecurityRegressionTest {
    @TempDir
    Path temporary;

    @Test
    void portalEndpointRequiresHttpsAndRejectsCredentials() {
        assertEquals(
                "https://vyprava.filiper.eu/api/plugin/sync",
                PortalClient.endpoint("https://vyprava.filiper.eu/").toString()
        );
        assertThrows(IllegalArgumentException.class, () -> PortalClient.endpoint("http://vyprava.filiper.eu"));
        assertThrows(IllegalArgumentException.class, () -> PortalClient.endpoint("https://user:secret@example.test"));
    }

    @Test
    void outboxAcknowledgesOnlyTheGenerationThatWasSent() throws Exception {
        ProgressOutbox outbox = new ProgressOutbox();
        UUID playerId = UUID.randomUUID();
        outbox.markPlayer("expedition", player(playerId, "first"));
        OutboxBatch first = outbox.copyPending();
        outbox.markPlayer("expedition", player(playerId, "second"));

        outbox.ack(first);

        assertTrue(outbox.hasPending());
        assertEquals("second", outbox.copyPending().players().getFirst().snapshot().name());
        Path file = temporary.resolve("outbox.yml");
        outbox.save(file);
        assertTrue(Files.isRegularFile(file));
        assertFalse(Files.exists(temporary.resolve("outbox.yml.tmp")));
    }

    private static PlayerSnapshot player(UUID id, String name) {
        return new PlayerSnapshot(
                id,
                name,
                1,
                0,
                0,
                null,
                "sk",
                "",
                "",
                "",
                0,
                true,
                Map.of(),
                Set.of(),
                Set.of(),
                Set.of(),
                Set.of(),
                Set.of(),
                Set.of(),
                Set.of(),
                Set.of()
        );
    }
}
