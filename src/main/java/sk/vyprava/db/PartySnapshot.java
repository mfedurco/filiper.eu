package sk.vyprava.db;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

public record PartySnapshot(
        String partyId,
        String name,
        UUID leader,
        String questKey,
        int progress,
        boolean completed,
        int generation,
        boolean pending,
        Map<UUID, Integer> contributions
) {
    public PartySnapshot {
        contributions = Map.copyOf(contributions);
        name = name == null ? "" : name;
        questKey = questKey == null ? "" : questKey;
    }

    public PartySnapshot withGeneration(int generation, boolean pending) {
        return new PartySnapshot(partyId, name, leader, questKey, progress, completed, generation, pending, contributions);
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("name", name);
        map.put("leader", leader == null ? "" : leader.toString());
        map.put("questKey", questKey);
        map.put("progress", progress);
        map.put("completed", completed);
        map.put("generation", generation);
        map.put("pending", pending);
        Map<String, Object> amounts = new LinkedHashMap<>();
        for (Map.Entry<UUID, Integer> entry : contributions.entrySet()) {
            amounts.put(entry.getKey().toString(), entry.getValue());
        }
        map.put("contributions", amounts);
        return map;
    }

    public static PartySnapshot fromMap(String partyId, Map<String, Object> map) {
        Map<UUID, Integer> contributions = new LinkedHashMap<>();
        Object raw = map.get("contributions");
        if (raw instanceof Map<?, ?> amounts) {
            for (Map.Entry<?, ?> entry : amounts.entrySet()) {
                int amount = entry.getValue() instanceof Number number ? number.intValue() : 0;
                contributions.put(UUID.fromString(String.valueOf(entry.getKey())), amount);
            }
        }
        String leaderRaw = map.get("leader") == null ? "" : String.valueOf(map.get("leader"));
        UUID leader = leaderRaw.isBlank() ? null : UUID.fromString(leaderRaw);
        return new PartySnapshot(
                partyId,
                map.get("name") == null ? "" : String.valueOf(map.get("name")),
                leader,
                map.get("questKey") == null ? "" : String.valueOf(map.get("questKey")),
                map.get("progress") instanceof Number progress ? progress.intValue() : 0,
                map.get("completed") instanceof Boolean completed && completed,
                map.get("generation") instanceof Number generation ? generation.intValue() : 0,
                map.get("pending") instanceof Boolean pending && pending,
                contributions
        );
    }
}
