package sk.vyprava.db;

import java.util.List;

public record QuestRecord(
        String stableKey,
        String kind,
        String title,
        String description,
        int points,
        int targetCount,
        String trackingType,
        List<String> filterValues,
        int sortOrder,
        boolean active,
        int minChapter,
        String rewardsJson,
        String chapterKey,
        Integer chapterOrder,
        String chapterTitle,
        String chapterDescription,
        String milestoneName,
        int milestonePoints,
        String milestoneRewardsJson
) {
    public QuestRecord {
        filterValues = List.copyOf(filterValues);
    }
}
