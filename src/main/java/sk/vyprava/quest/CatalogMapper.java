package sk.vyprava.quest;

import sk.vyprava.db.GoalMeta;
import sk.vyprava.db.QuestRecord;
import sk.vyprava.model.ChapterDefinition;
import sk.vyprava.model.ObjectiveType;
import sk.vyprava.model.QuestDefinition;
import sk.vyprava.model.QuestScope;
import sk.vyprava.model.RewardItem;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class CatalogMapper {
    private static final Pattern REWARD = Pattern.compile(
            "\"material\"\\s*:\\s*\"([A-Za-z0-9_]+)\"\\s*,\\s*\"amount\"\\s*:\\s*(\\d+)");

    public Map<String, GoalMeta> install(QuestRegistry registry, List<QuestRecord> records) {
        Map<String, List<QuestRecord>> chapterRows = new LinkedHashMap<>();
        Map<String, QuestDefinition> campaign = new LinkedHashMap<>();
        Map<String, QuestDefinition> daily = new LinkedHashMap<>();
        Map<String, QuestDefinition> weekly = new LinkedHashMap<>();
        Map<String, QuestDefinition> longTerm = new LinkedHashMap<>();
        Map<String, QuestDefinition> party = new LinkedHashMap<>();
        Map<String, QuestDefinition> shared = new LinkedHashMap<>();
        Map<String, GoalMeta> goals = new LinkedHashMap<>();

        List<QuestRecord> ordered = records.stream()
                .sorted(Comparator.comparingInt(QuestRecord::sortOrder))
                .toList();
        for (QuestRecord record : ordered) {
            if (!record.active()) {
                continue;
            }
            QuestDefinition quest = toQuest(record);
            goals.put(record.stableKey(), toGoal(record, quest));
            switch (record.kind()) {
                case "kampan" -> {
                    campaign.put(quest.id(), quest);
                    if (record.chapterKey() != null) {
                        chapterRows.computeIfAbsent(record.chapterKey(), key -> new ArrayList<>()).add(record);
                    }
                }
                case "denne" -> daily.put(quest.id(), quest);
                case "tyzdenne" -> weekly.put(quest.id(), quest);
                case "dlhodobe" -> longTerm.put(quest.id(), quest);
                case "spolocne" -> shared.put(quest.id(), quest);
                case "party" -> party.put(quest.id(), quest);
                default -> {
                }
            }
        }

        List<ChapterDefinition> chapters = new ArrayList<>();
        for (List<QuestRecord> rows : chapterRows.values()) {
            QuestRecord first = rows.get(0);
            List<QuestDefinition> quests = new ArrayList<>();
            for (QuestRecord row : rows) {
                quests.add(campaign.get(row.stableKey()));
            }
            chapters.add(new ChapterDefinition(
                    first.chapterKey(),
                    first.chapterOrder() == null ? 1 : first.chapterOrder(),
                    first.chapterTitle() == null ? first.chapterKey() : first.chapterTitle(),
                    first.chapterDescription() == null ? "" : first.chapterDescription(),
                    quests,
                    first.milestoneName() == null ? "Milník" : first.milestoneName(),
                    rewards(first.milestoneRewardsJson()),
                    first.milestonePoints()
            ));
        }
        chapters.sort(Comparator.comparingInt(ChapterDefinition::order));
        registry.replace(chapters, campaign, daily, weekly, longTerm, party, shared);
        return Map.copyOf(goals);
    }

    private static QuestDefinition toQuest(QuestRecord record) {
        QuestScope scope = switch (record.kind()) {
            case "denne" -> QuestScope.DAILY;
            case "tyzdenne" -> QuestScope.WEEKLY;
            case "dlhodobe" -> QuestScope.LONG_TERM;
            case "spolocne" -> QuestScope.SHARED;
            case "party" -> QuestScope.PARTY;
            default -> QuestScope.CAMPAIGN;
        };
        return new QuestDefinition(
                record.stableKey(),
                record.title(),
                record.description(),
                ObjectiveType.fromTracking(record.trackingType()),
                record.filterValues(),
                record.targetCount(),
                record.points(),
                record.minChapter(),
                rewards(record.rewardsJson()),
                scope,
                record.chapterKey()
        );
    }

    private static GoalMeta toGoal(QuestRecord record, QuestDefinition quest) {
        String kind = switch (record.kind()) {
            case "denne" -> "daily";
            case "tyzdenne" -> "weekly";
            case "dlhodobe" -> "long_term";
            case "spolocne" -> "shared";
            case "party" -> "party";
            default -> "campaign";
        };
        return new GoalMeta(
                kind,
                quest.name(),
                quest.description(),
                quest.type().name(),
                quest.targets(),
                quest.amount(),
                quest.points(),
                quest.minChapter(),
                record.chapterKey(),
                record.chapterOrder(),
                record.rewardsJson() == null ? "[]" : record.rewardsJson()
        );
    }

    private static List<RewardItem> rewards(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        List<Map<String, Object>> raw = new ArrayList<>();
        Matcher matcher = REWARD.matcher(json);
        while (matcher.find()) {
            raw.add(Map.of("material", matcher.group(1), "amount", Integer.parseInt(matcher.group(2))));
        }
        return RewardItem.parseList(raw);
    }
}
