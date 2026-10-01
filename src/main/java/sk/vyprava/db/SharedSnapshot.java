package sk.vyprava.db;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

public record SharedSnapshot(
        String questKey,
        int progress,
        boolean completed,
        String periodKey,
        int generation,
        boolean pending,
        Map<UUID, Integer> contributions
) {
    public SharedSnapshot {
        contributions = Map.copyOf(contributions);
        periodKey = periodKey == null ? "" : periodKey;
    }

    public SharedSnapshot withGeneration(int generation, boolean pending) {
        return new SharedSnapshot(questKey, progress, completed, periodKey, generation, pending, contributions);
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("progress", progress);
        map.put("completed", completed);
        map.put("periodKey", periodKey);
        map.put("generation", generation);
        map.put("pending", pending);
        Map<String, Object> amounts = new LinkedHashMap<>();
        for (Map.Entry<UUID, Integer> entry : contributions.entrySet()) {
            amounts.put(entry.getKey().toString(), entry.getValue());
        }
        map.put("contributions", amounts);
        return map;
    }

    public static SharedSnapshot fromMap(String questKey, Map<String, Object> map) {
        Map<UUID, Integer> contributions = new LinkedHashMap<>();
        Object raw = map.get("contributions");
        if (raw instanceof Map<?, ?> amounts) {
            for (Map.Entry<?, ?> entry : amounts.entrySet()) {
                int amount = entry.getValue() instanceof Number number ? number.intValue() : 0;
                contributions.put(UUID.fromString(String.valueOf(entry.getKey())), amount);
            }
        }
        boolean pending = map.get("pending") instanceof Boolean flag && flag;
        int generation = map.get("generation") instanceof Number number ? number.intValue() : 0;
        int progress = map.get("progress") instanceof Number number ? number.intValue() : 0;
        boolean completed = map.get("completed") instanceof Boolean flag && flag;
        String period = map.get("periodKey") == null ? "" : String.valueOf(map.get("periodKey"));
        return new SharedSnapshot(questKey, progress, completed, period, generation, pending, contributions);
    }
}
