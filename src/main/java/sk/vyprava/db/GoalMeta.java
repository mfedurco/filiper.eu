package sk.vyprava.db;

import java.util.List;

public record GoalMeta(
        String goalKind,
        String name,
        String description,
        String objectiveType,
        List<String> targets,
        int amount,
        int points,
        int minChapter,
        String chapterId,
        Integer chapterOrder,
        String rewardsJson
) {
    public GoalMeta {
        targets = List.copyOf(targets);
        rewardsJson = rewardsJson == null || rewardsJson.isBlank() ? "[]" : rewardsJson;
    }
}
