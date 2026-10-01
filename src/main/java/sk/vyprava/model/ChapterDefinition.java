package sk.vyprava.model;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public final class ChapterDefinition {
    private final String id;
    private final int order;
    private final String name;
    private final String description;
    private final List<QuestDefinition> quests;
    private final String milestoneName;
    private final List<RewardItem> milestoneRewards;
    private final int milestonePoints;

    public ChapterDefinition(
            String id,
            int order,
            String name,
            String description,
            List<QuestDefinition> quests,
            String milestoneName,
            List<RewardItem> milestoneRewards,
            int milestonePoints
    ) {
        this.id = id;
        this.order = order;
        this.name = name;
        this.description = description;
        this.quests = List.copyOf(quests);
        this.milestoneName = milestoneName;
        this.milestoneRewards = List.copyOf(milestoneRewards);
        this.milestonePoints = milestonePoints;
    }

    public String id() {
        return id;
    }

    public int order() {
        return order;
    }

    public String name() {
        return name;
    }

    public String description() {
        return description;
    }

    public List<QuestDefinition> quests() {
        return quests;
    }

    public String milestoneName() {
        return milestoneName;
    }

    public List<RewardItem> milestoneRewards() {
        return milestoneRewards;
    }

    public int milestonePoints() {
        return milestonePoints;
    }

    public static List<ChapterDefinition> sorted(List<ChapterDefinition> chapters) {
        List<ChapterDefinition> copy = new ArrayList<>(chapters);
        copy.sort(Comparator.comparingInt(ChapterDefinition::order));
        return List.copyOf(copy);
    }
}
