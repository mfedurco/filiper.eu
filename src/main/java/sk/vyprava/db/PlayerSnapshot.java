package sk.vyprava.db;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public record PlayerSnapshot(
        UUID uuid,
        String name,
        int chapter,
        int totalPoints,
        int weeklyPoints,
        String partyId,
        String dailyDate,
        String weeklyKey,
        String longTermSeason,
        int generation,
        boolean pending,
        Map<String, QuestRow> quests,
        Set<String> assignedDaily,
        Set<String> assignedWeekly,
        Set<String> assignedLongTerm,
        Set<String> completedCampaign,
        Set<String> completedDaily,
        Set<String> completedWeekly,
        Set<String> completedLongTerm,
        Set<String> completedChapters
) {
    public PlayerSnapshot {
        quests = Map.copyOf(quests);
        assignedDaily = Set.copyOf(assignedDaily);
        assignedWeekly = Set.copyOf(assignedWeekly);
        assignedLongTerm = Set.copyOf(assignedLongTerm);
        completedCampaign = Set.copyOf(completedCampaign);
        completedDaily = Set.copyOf(completedDaily);
        completedWeekly = Set.copyOf(completedWeekly);
        completedLongTerm = Set.copyOf(completedLongTerm);
        completedChapters = Set.copyOf(completedChapters);
    }

    public PlayerSnapshot withGeneration(int generation, boolean pending) {
        return new PlayerSnapshot(
                uuid, name, chapter, totalPoints, weeklyPoints, partyId,
                dailyDate, weeklyKey, longTermSeason, generation, pending, quests,
                assignedDaily, assignedWeekly, assignedLongTerm,
                completedCampaign, completedDaily, completedWeekly, completedLongTerm, completedChapters
        );
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("name", name);
        map.put("chapter", chapter);
        map.put("totalPoints", totalPoints);
        map.put("weeklyPoints", weeklyPoints);
        map.put("partyId", partyId == null ? "" : partyId);
        map.put("dailyDate", dailyDate == null ? "" : dailyDate);
        map.put("weeklyKey", weeklyKey == null ? "" : weeklyKey);
        map.put("longTermSeason", longTermSeason == null ? "" : longTermSeason);
        map.put("generation", generation);
        map.put("pending", pending);
        Map<String, Object> questMap = new LinkedHashMap<>();
        for (Map.Entry<String, QuestRow> entry : quests.entrySet()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("goalKind", entry.getValue().goalKind());
            row.put("current", entry.getValue().current());
            row.put("completed", entry.getValue().completed());
            questMap.put(entry.getKey(), row);
        }
        map.put("quests", questMap);
        map.put("assignedDaily", ListOf.copy(assignedDaily));
        map.put("assignedWeekly", ListOf.copy(assignedWeekly));
        map.put("assignedLongTerm", ListOf.copy(assignedLongTerm));
        map.put("completedCampaign", ListOf.copy(completedCampaign));
        map.put("completedDaily", ListOf.copy(completedDaily));
        map.put("completedWeekly", ListOf.copy(completedWeekly));
        map.put("completedLongTerm", ListOf.copy(completedLongTerm));
        map.put("completedChapters", ListOf.copy(completedChapters));
        return map;
    }

    @SuppressWarnings("unchecked")
    public static PlayerSnapshot fromMap(UUID uuid, Map<String, Object> map) {
        Map<String, QuestRow> quests = new LinkedHashMap<>();
        Object rawQuests = map.get("quests");
        if (rawQuests instanceof Map<?, ?> questMap) {
            for (Map.Entry<?, ?> entry : questMap.entrySet()) {
                if (entry.getValue() instanceof Map<?, ?> row) {
                    quests.put(String.valueOf(entry.getKey()), new QuestRow(
                            string(row.get("goalKind"), "campaign"),
                            number(row.get("current")),
                            bool(row.get("completed"))
                    ));
                }
            }
        }
        return new PlayerSnapshot(
                uuid,
                string(map.get("name"), "Unknown"),
                number(map.get("chapter")),
                number(map.get("totalPoints")),
                number(map.get("weeklyPoints")),
                emptyToNull(string(map.get("partyId"), "")),
                string(map.get("dailyDate"), ""),
                string(map.get("weeklyKey"), ""),
                string(map.get("longTermSeason"), ""),
                number(map.get("generation")),
                bool(map.get("pending")),
                quests,
                setOf(map.get("assignedDaily")),
                setOf(map.get("assignedWeekly")),
                setOf(map.get("assignedLongTerm")),
                setOf(map.get("completedCampaign")),
                setOf(map.get("completedDaily")),
                setOf(map.get("completedWeekly")),
                setOf(map.get("completedLongTerm")),
                setOf(map.get("completedChapters"))
        );
    }

    private static String string(Object value, String fallback) {
        return value == null ? fallback : String.valueOf(value);
    }

    private static int number(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value == null) {
            return 0;
        }
        return Integer.parseInt(String.valueOf(value));
    }

    private static boolean bool(Object value) {
        if (value instanceof Boolean flag) {
            return flag;
        }
        return value != null && Boolean.parseBoolean(String.valueOf(value));
    }

    private static String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static Set<String> setOf(Object value) {
        Set<String> out = new LinkedHashSet<>();
        if (value instanceof List<?> list) {
            for (Object item : list) {
                if (item != null) {
                    out.add(String.valueOf(item));
                }
            }
        }
        return out;
    }

    private static final class ListOf {
        private static java.util.List<String> copy(Set<String> values) {
            return java.util.List.copyOf(values);
        }
    }
}
