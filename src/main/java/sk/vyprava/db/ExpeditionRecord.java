package sk.vyprava.db;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ExpeditionRecord(
        UUID id,
        String slug,
        String title,
        String description,
        String status,
        OffsetDateTime startsAt,
        OffsetDateTime endsAt
) {
}
