package sk.vyprava.db;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Durable YAML queue of player progress. A successful database push clears {@code pending}.
 */
public final class ProgressOutbox {
    private final Map<String, Slice> slices = new LinkedHashMap<>();

    public synchronized void markPlayer(String expeditionId, PlayerSnapshot snapshot) {
        Slice slice = slices.computeIfAbsent(expeditionId, key -> new Slice());
        PlayerSnapshot previous = slice.players.get(snapshot.uuid());
        int generation = previous == null ? 1 : previous.generation() + 1;
        slice.players.put(snapshot.uuid(), snapshot.withGeneration(generation, true));
    }

    public synchronized void markShared(String expeditionId, SharedSnapshot snapshot) {
        Slice slice = slices.computeIfAbsent(expeditionId, key -> new Slice());
        SharedSnapshot previous = slice.shared.get(snapshot.questKey());
        int generation = previous == null ? 1 : previous.generation() + 1;
        slice.shared.put(snapshot.questKey(), snapshot.withGeneration(generation, true));
    }

    public synchronized void markParty(String expeditionId, PartySnapshot snapshot) {
        Slice slice = slices.computeIfAbsent(expeditionId, key -> new Slice());
        PartySnapshot previous = slice.parties.get(snapshot.partyId());
        int generation = previous == null ? 1 : previous.generation() + 1;
        slice.parties.put(snapshot.partyId(), snapshot.withGeneration(generation, true));
    }

    public synchronized boolean hasPending() {
        for (Slice slice : slices.values()) {
            if (slice.hasPending()) {
                return true;
            }
        }
        return false;
    }

    public synchronized OutboxBatch copyPending() {
        List<OutboxBatch.PlayerPush> players = new ArrayList<>();
        List<OutboxBatch.SharedPush> shared = new ArrayList<>();
        List<OutboxBatch.PartyPush> parties = new ArrayList<>();
        for (Map.Entry<String, Slice> entry : slices.entrySet()) {
            String expeditionId = entry.getKey();
            Slice slice = entry.getValue();
            for (PlayerSnapshot snapshot : slice.players.values()) {
                if (snapshot.pending()) {
                    players.add(new OutboxBatch.PlayerPush(expeditionId, snapshot));
                }
            }
            for (SharedSnapshot snapshot : slice.shared.values()) {
                if (snapshot.pending()) {
                    shared.add(new OutboxBatch.SharedPush(expeditionId, snapshot));
                }
            }
            for (PartySnapshot snapshot : slice.parties.values()) {
                if (snapshot.pending()) {
                    parties.add(new OutboxBatch.PartyPush(expeditionId, snapshot));
                }
            }
        }
        return new OutboxBatch(players, shared, parties);
    }

    public synchronized void ack(OutboxBatch batch) {
        for (OutboxBatch.PlayerPush push : batch.players()) {
            Slice slice = slices.get(push.expeditionId());
            if (slice == null) {
                continue;
            }
            PlayerSnapshot current = slice.players.get(push.snapshot().uuid());
            if (current != null && current.generation() == push.snapshot().generation()) {
                slice.players.put(current.uuid(), current.withGeneration(current.generation(), false));
            }
        }
        for (OutboxBatch.SharedPush push : batch.shared()) {
            Slice slice = slices.get(push.expeditionId());
            if (slice == null) {
                continue;
            }
            SharedSnapshot current = slice.shared.get(push.snapshot().questKey());
            if (current != null && current.generation() == push.snapshot().generation()) {
                slice.shared.put(current.questKey(), current.withGeneration(current.generation(), false));
            }
        }
        for (OutboxBatch.PartyPush push : batch.parties()) {
            Slice slice = slices.get(push.expeditionId());
            if (slice == null) {
                continue;
            }
            PartySnapshot current = slice.parties.get(push.snapshot().partyId());
            if (current != null && current.generation() == push.snapshot().generation()) {
                slice.parties.put(current.partyId(), current.withGeneration(current.generation(), false));
            }
        }
    }

    public synchronized List<PlayerSnapshot> pendingPlayers(String expeditionId) {
        Slice slice = slices.get(expeditionId);
        if (slice == null) {
            return List.of();
        }
        List<PlayerSnapshot> pending = new ArrayList<>();
        for (PlayerSnapshot snapshot : slice.players.values()) {
            if (snapshot.pending()) {
                pending.add(snapshot);
            }
        }
        return pending;
    }

    public synchronized List<SharedSnapshot> pendingShared(String expeditionId) {
        Slice slice = slices.get(expeditionId);
        if (slice == null) {
            return List.of();
        }
        List<SharedSnapshot> pending = new ArrayList<>();
        for (SharedSnapshot snapshot : slice.shared.values()) {
            if (snapshot.pending()) {
                pending.add(snapshot);
            }
        }
        return pending;
    }

    public synchronized List<PartySnapshot> pendingParties(String expeditionId) {
        Slice slice = slices.get(expeditionId);
        if (slice == null) {
            return List.of();
        }
        List<PartySnapshot> pending = new ArrayList<>();
        for (PartySnapshot snapshot : slice.parties.values()) {
            if (snapshot.pending()) {
                pending.add(snapshot);
            }
        }
        return pending;
    }

    public synchronized void save(Path file) throws IOException {
        Map<String, Object> root = new LinkedHashMap<>();
        Map<String, Object> expeditions = new LinkedHashMap<>();
        for (Map.Entry<String, Slice> entry : slices.entrySet()) {
            expeditions.put(entry.getKey(), entry.getValue().toMap());
        }
        root.put("expeditions", expeditions);
        if (file.getParent() != null) {
            Files.createDirectories(file.getParent());
        }
        Path temporary = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(temporary, SimpleYaml.dump(root), StandardCharsets.UTF_8);
        try {
            Files.move(
                    temporary,
                    file,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING
            );
        } catch (java.nio.file.AtomicMoveNotSupportedException ignored) {
            Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    @SuppressWarnings("unchecked")
    public synchronized void load(Path file) throws IOException {
        slices.clear();
        if (!Files.isRegularFile(file)) {
            return;
        }
        Map<String, Object> root = SimpleYaml.parse(Files.readString(file, StandardCharsets.UTF_8));
        Object raw = root.get("expeditions");
        if (!(raw instanceof Map<?, ?> expeditions)) {
            return;
        }
        for (Map.Entry<?, ?> entry : expeditions.entrySet()) {
            if (entry.getValue() instanceof Map<?, ?> map) {
                slices.put(String.valueOf(entry.getKey()), Slice.fromMap((Map<String, Object>) map));
            }
        }
    }

    private static final class Slice {
        private final Map<UUID, PlayerSnapshot> players = new LinkedHashMap<>();
        private final Map<String, SharedSnapshot> shared = new LinkedHashMap<>();
        private final Map<String, PartySnapshot> parties = new LinkedHashMap<>();

        private boolean hasPending() {
            for (PlayerSnapshot snapshot : players.values()) {
                if (snapshot.pending()) {
                    return true;
                }
            }
            for (SharedSnapshot snapshot : shared.values()) {
                if (snapshot.pending()) {
                    return true;
                }
            }
            for (PartySnapshot snapshot : parties.values()) {
                if (snapshot.pending()) {
                    return true;
                }
            }
            return false;
        }

        private Map<String, Object> toMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            Map<String, Object> playerMap = new LinkedHashMap<>();
            for (PlayerSnapshot snapshot : players.values()) {
                playerMap.put(snapshot.uuid().toString(), snapshot.toMap());
            }
            Map<String, Object> sharedMap = new LinkedHashMap<>();
            for (SharedSnapshot snapshot : shared.values()) {
                sharedMap.put(snapshot.questKey(), snapshot.toMap());
            }
            Map<String, Object> partyMap = new LinkedHashMap<>();
            for (PartySnapshot snapshot : parties.values()) {
                partyMap.put(snapshot.partyId(), snapshot.toMap());
            }
            map.put("players", playerMap);
            map.put("shared", sharedMap);
            map.put("party", partyMap);
            return map;
        }

        @SuppressWarnings("unchecked")
        private static Slice fromMap(Map<String, Object> map) {
            Slice slice = new Slice();
            Object players = map.get("players");
            if (players instanceof Map<?, ?> playerMap) {
                for (Map.Entry<?, ?> entry : playerMap.entrySet()) {
                    if (entry.getValue() instanceof Map<?, ?> row) {
                        UUID uuid = UUID.fromString(String.valueOf(entry.getKey()));
                        slice.players.put(uuid, PlayerSnapshot.fromMap(uuid, (Map<String, Object>) row));
                    }
                }
            }
            Object shared = map.get("shared");
            if (shared instanceof Map<?, ?> sharedMap) {
                for (Map.Entry<?, ?> entry : sharedMap.entrySet()) {
                    if (entry.getValue() instanceof Map<?, ?> row) {
                        String key = String.valueOf(entry.getKey());
                        slice.shared.put(key, SharedSnapshot.fromMap(key, (Map<String, Object>) row));
                    }
                }
            }
            Object party = map.get("party");
            if (party instanceof Map<?, ?> partyMap) {
                for (Map.Entry<?, ?> entry : partyMap.entrySet()) {
                    if (entry.getValue() instanceof Map<?, ?> row) {
                        String id = String.valueOf(entry.getKey());
                        slice.parties.put(id, PartySnapshot.fromMap(id, (Map<String, Object>) row));
                    }
                }
            }
            return slice;
        }
    }
}
