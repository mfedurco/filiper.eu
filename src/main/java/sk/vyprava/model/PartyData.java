package sk.vyprava.model;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public final class PartyData {
    private final String id;
    private String name;
    private UUID leader;
    private final Set<UUID> members = new HashSet<>();
    private String activeQuestId;
    private String questDate = "";
    private int questProgress;
    private boolean questCompleted;
    private final Map<UUID, Integer> contribution = new HashMap<>();

    public PartyData(String id, String name, UUID leader) {
        this.id = id;
        this.name = name;
        this.leader = leader;
        this.members.add(leader);
    }

    public String id() {
        return id;
    }

    public String name() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public UUID leader() {
        return leader;
    }

    public void setLeader(UUID leader) {
        this.leader = leader;
    }

    public Set<UUID> members() {
        return members;
    }

    public String activeQuestId() {
        return activeQuestId;
    }

    public void setActiveQuestId(String activeQuestId) {
        this.activeQuestId = activeQuestId;
    }

    public String questDate() {
        return questDate;
    }

    public void setQuestDate(String questDate) {
        this.questDate = questDate == null ? "" : questDate;
    }

    public int questProgress() {
        return questProgress;
    }

    public void setQuestProgress(int questProgress) {
        this.questProgress = Math.max(0, questProgress);
    }

    public boolean questCompleted() {
        return questCompleted;
    }

    public void setQuestCompleted(boolean questCompleted) {
        this.questCompleted = questCompleted;
    }

    public Map<UUID, Integer> contribution() {
        return contribution;
    }
}
