package sk.vyprava.quest;

import sk.vyprava.model.ChapterDefinition;
import sk.vyprava.model.QuestDefinition;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * In-memory catalog. The plugin fills it from Neon; quest YAML is not a source of truth.
 */
public final class QuestRegistry {
    private final List<ChapterDefinition> chapters = new ArrayList<>();
    private final Map<String, QuestDefinition> campaignQuests = new HashMap<>();
    private final Map<String, QuestDefinition> dailyPool = new HashMap<>();
    private final Map<String, QuestDefinition> weeklyPool = new HashMap<>();
    private final Map<String, QuestDefinition> longTermPool = new HashMap<>();
    private final Map<String, QuestDefinition> partyPool = new HashMap<>();
    private final Map<String, QuestDefinition> sharedPool = new HashMap<>();

    public void replace(
            List<ChapterDefinition> newChapters,
            Map<String, QuestDefinition> campaign,
            Map<String, QuestDefinition> daily,
            Map<String, QuestDefinition> weekly,
            Map<String, QuestDefinition> longTerm,
            Map<String, QuestDefinition> party,
            Map<String, QuestDefinition> shared
    ) {
        chapters.clear();
        chapters.addAll(newChapters);
        replace(campaignQuests, campaign);
        replace(dailyPool, daily);
        replace(weeklyPool, weekly);
        replace(longTermPool, longTerm);
        replace(partyPool, party);
        replace(sharedPool, shared);
    }

    public void clear() {
        replace(List.of(), Map.of(), Map.of(), Map.of(), Map.of(), Map.of(), Map.of());
    }

    public boolean hasQuests() {
        return !campaignQuests.isEmpty()
                || !dailyPool.isEmpty()
                || !weeklyPool.isEmpty()
                || !longTermPool.isEmpty()
                || !partyPool.isEmpty()
                || !sharedPool.isEmpty();
    }

    private static void replace(Map<String, QuestDefinition> target, Map<String, QuestDefinition> source) {
        target.clear();
        target.putAll(source);
    }

    public List<ChapterDefinition> chapters() {
        return List.copyOf(chapters);
    }

    public Optional<ChapterDefinition> chapterByOrder(int order) {
        return chapters.stream().filter(c -> c.order() == order).findFirst();
    }

    public Optional<ChapterDefinition> chapterById(String id) {
        return chapters.stream().filter(c -> c.id().equals(id)).findFirst();
    }

    public Optional<QuestDefinition> campaignQuest(String id) {
        return Optional.ofNullable(campaignQuests.get(id));
    }

    public Optional<QuestDefinition> dailyQuest(String id) {
        return Optional.ofNullable(dailyPool.get(id));
    }

    public Optional<QuestDefinition> weeklyQuest(String id) {
        return Optional.ofNullable(weeklyPool.get(id));
    }

    public Optional<QuestDefinition> longTermQuest(String id) {
        return Optional.ofNullable(longTermPool.get(id));
    }

    public Optional<QuestDefinition> partyQuest(String id) {
        return Optional.ofNullable(partyPool.get(id));
    }

    public Optional<QuestDefinition> sharedQuest(String id) {
        return Optional.ofNullable(sharedPool.get(id));
    }

    public Map<String, QuestDefinition> dailyPool() {
        return Map.copyOf(dailyPool);
    }

    public Map<String, QuestDefinition> weeklyPool() {
        return Map.copyOf(weeklyPool);
    }

    public Map<String, QuestDefinition> longTermPool() {
        return Map.copyOf(longTermPool);
    }

    public Map<String, QuestDefinition> partyPool() {
        return Map.copyOf(partyPool);
    }

    public Map<String, QuestDefinition> sharedPool() {
        return Map.copyOf(sharedPool);
    }

    public Optional<QuestDefinition> find(String id) {
        if (campaignQuests.containsKey(id)) {
            return Optional.of(campaignQuests.get(id));
        }
        if (dailyPool.containsKey(id)) {
            return Optional.of(dailyPool.get(id));
        }
        if (weeklyPool.containsKey(id)) {
            return Optional.of(weeklyPool.get(id));
        }
        if (longTermPool.containsKey(id)) {
            return Optional.of(longTermPool.get(id));
        }
        if (partyPool.containsKey(id)) {
            return Optional.of(partyPool.get(id));
        }
        if (sharedPool.containsKey(id)) {
            return Optional.of(sharedPool.get(id));
        }
        return Optional.empty();
    }

    public int maxChapterOrder() {
        return chapters.stream().mapToInt(ChapterDefinition::order).max().orElse(1);
    }
}
