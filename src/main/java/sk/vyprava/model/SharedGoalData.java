package sk.vyprava.model;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Server-wide alebo sezónny spoločný cieľ s príspevkami hráčov.
 */
public final class SharedGoalData {
    private final String id;
    private String questId;
    private String periodKey = "";
    private int progress;
    private boolean completed;
    private final Map<UUID, Integer> contributions = new HashMap<>();

    public SharedGoalData(String id, String questId, String periodKey) {
        this.id = id;
        this.questId = questId;
        this.periodKey = periodKey == null ? "" : periodKey;
    }

    public String id() {
        return id;
    }

    public String questId() {
        return questId;
    }

    public void setQuestId(String questId) {
        this.questId = questId;
    }

    public String periodKey() {
        return periodKey;
    }

    public void setPeriodKey(String periodKey) {
        this.periodKey = periodKey == null ? "" : periodKey;
    }

    public int progress() {
        return progress;
    }

    public void setProgress(int progress) {
        this.progress = Math.max(0, progress);
    }

    public boolean completed() {
        return completed;
    }

    public void setCompleted(boolean completed) {
        this.completed = completed;
    }

    public Map<UUID, Integer> contributions() {
        return contributions;
    }

    public void addContribution(UUID playerId, int amount) {
        if (amount <= 0) {
            return;
        }
        contributions.merge(playerId, amount, Integer::sum);
        progress += amount;
    }
}
