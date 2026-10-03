package sk.vyprava.model;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public final class PlayerProgress {
    private final UUID uuid;
    private String name;
    private int currentChapterOrder = 1;
    private int totalPoints;
    private int weeklyPoints;
    private String dailyDate = "";
    private String weeklyKey = "";
    private String longTermSeason = "";
    private final Map<String, Integer> campaignProgress = new HashMap<>();
    private final Set<String> completedCampaign = new HashSet<>();
    private final Set<String> completedChapters = new HashSet<>();
    private final Map<String, Integer> dailyProgress = new HashMap<>();
    private final Set<String> completedDaily = new HashSet<>();
    private final Set<String> assignedDaily = new HashSet<>();
    private final Map<String, Integer> weeklyProgress = new HashMap<>();
    private final Set<String> completedWeekly = new HashSet<>();
    private final Set<String> assignedWeekly = new HashSet<>();
    private final Map<String, Integer> longTermProgress = new HashMap<>();
    private final Set<String> completedLongTerm = new HashSet<>();
    private final Set<String> assignedLongTerm = new HashSet<>();
    private String partyId;
    private String language;

    public PlayerProgress(UUID uuid, String name) {
        this.uuid = uuid;
        this.name = name;
    }

    public UUID uuid() {
        return uuid;
    }

    public String name() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public int currentChapterOrder() {
        return currentChapterOrder;
    }

    public void setCurrentChapterOrder(int currentChapterOrder) {
        this.currentChapterOrder = Math.max(1, currentChapterOrder);
    }

    public int totalPoints() {
        return totalPoints;
    }

    public void addPoints(int points) {
        this.totalPoints += points;
        this.weeklyPoints += points;
    }

    public void setTotalPoints(int totalPoints) {
        this.totalPoints = totalPoints;
    }

    public int weeklyPoints() {
        return weeklyPoints;
    }

    public void setWeeklyPoints(int weeklyPoints) {
        this.weeklyPoints = weeklyPoints;
    }

    public String dailyDate() {
        return dailyDate;
    }

    public void setDailyDate(String dailyDate) {
        this.dailyDate = dailyDate == null ? "" : dailyDate;
    }

    public String weeklyKey() {
        return weeklyKey;
    }

    public void setWeeklyKey(String weeklyKey) {
        this.weeklyKey = weeklyKey == null ? "" : weeklyKey;
    }

    public String longTermSeason() {
        return longTermSeason;
    }

    public void setLongTermSeason(String longTermSeason) {
        this.longTermSeason = longTermSeason == null ? "" : longTermSeason;
    }

    public Map<String, Integer> campaignProgress() {
        return campaignProgress;
    }

    public Set<String> completedCampaign() {
        return completedCampaign;
    }

    public Set<String> completedChapters() {
        return completedChapters;
    }

    public Map<String, Integer> dailyProgress() {
        return dailyProgress;
    }

    public Set<String> completedDaily() {
        return completedDaily;
    }

    public Set<String> assignedDaily() {
        return assignedDaily;
    }

    public Map<String, Integer> weeklyProgress() {
        return weeklyProgress;
    }

    public Set<String> completedWeekly() {
        return completedWeekly;
    }

    public Set<String> assignedWeekly() {
        return assignedWeekly;
    }

    public Map<String, Integer> longTermProgress() {
        return longTermProgress;
    }

    public Set<String> completedLongTerm() {
        return completedLongTerm;
    }

    public Set<String> assignedLongTerm() {
        return assignedLongTerm;
    }

    public String partyId() {
        return partyId;
    }

    public void setPartyId(String partyId) {
        this.partyId = partyId;
    }

    public String language() {
        return language;
    }

    public void setLanguage(String language) {
        if (language == null || language.isBlank()) {
            this.language = null;
            return;
        }
        this.language = language.trim().toLowerCase(java.util.Locale.ROOT);
    }

    public int getProgress(QuestScope scope, String questId) {
        return switch (scope) {
            case CAMPAIGN -> campaignProgress.getOrDefault(questId, 0);
            case DAILY -> dailyProgress.getOrDefault(questId, 0);
            case WEEKLY -> weeklyProgress.getOrDefault(questId, 0);
            case LONG_TERM -> longTermProgress.getOrDefault(questId, 0);
            case PARTY, SHARED -> 0;
        };
    }

    public boolean isCompleted(QuestScope scope, String questId) {
        return switch (scope) {
            case CAMPAIGN -> completedCampaign.contains(questId);
            case DAILY -> completedDaily.contains(questId);
            case WEEKLY -> completedWeekly.contains(questId);
            case LONG_TERM -> completedLongTerm.contains(questId);
            case PARTY, SHARED -> false;
        };
    }
}
