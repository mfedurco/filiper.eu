package sk.vyprava.db;

import java.util.List;

public record OutboxBatch(
        List<PlayerPush> players,
        List<SharedPush> shared,
        List<PartyPush> parties
) {
    public OutboxBatch {
        players = List.copyOf(players);
        shared = List.copyOf(shared);
        parties = List.copyOf(parties);
    }

    public boolean isEmpty() {
        return players.isEmpty() && shared.isEmpty() && parties.isEmpty();
    }

    public record PlayerPush(String expeditionId, PlayerSnapshot snapshot) {
    }

    public record SharedPush(String expeditionId, SharedSnapshot snapshot) {
    }

    public record PartyPush(String expeditionId, PartySnapshot snapshot) {
    }
}
