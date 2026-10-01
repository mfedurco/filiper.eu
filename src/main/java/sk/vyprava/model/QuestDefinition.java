package sk.vyprava.model;

import java.util.List;

public final class QuestDefinition {
    private final String id;
    private final String name;
    private final String description;
    private final ObjectiveType type;
    private final List<String> targets;
    private final int amount;
    private final int points;
    private final int minChapter;
    private final List<RewardItem> rewards;
    private final QuestScope scope;
    private final String chapterId;

    public QuestDefinition(
            String id,
            String name,
            String description,
            ObjectiveType type,
            List<String> targets,
            int amount,
            int points,
            int minChapter,
            List<RewardItem> rewards,
            QuestScope scope,
            String chapterId
    ) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.type = type;
        this.targets = List.copyOf(targets);
        this.amount = Math.max(1, amount);
        this.points = Math.max(0, points);
        this.minChapter = Math.max(1, minChapter);
        this.rewards = List.copyOf(rewards);
        this.scope = scope;
        this.chapterId = chapterId;
    }

    public String id() {
        return id;
    }

    public String name() {
        return name;
    }

    public String description() {
        return description;
    }

    public ObjectiveType type() {
        return type;
    }

    public List<String> targets() {
        return targets;
    }

    public int amount() {
        return amount;
    }

    public int points() {
        return points;
    }

    public int minChapter() {
        return minChapter;
    }

    public List<RewardItem> rewards() {
        return rewards;
    }

    public QuestScope scope() {
        return scope;
    }

    public String chapterId() {
        return chapterId;
    }
}
