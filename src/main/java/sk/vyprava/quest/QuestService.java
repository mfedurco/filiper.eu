package sk.vyprava.quest;

import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.Player;
import sk.vyprava.leaderboard.LeaderboardService;
import sk.vyprava.model.ChapterDefinition;
import sk.vyprava.model.ObjectiveType;
import sk.vyprava.model.PartyData;
import sk.vyprava.model.PlayerProgress;
import sk.vyprava.model.QuestDefinition;
import sk.vyprava.model.QuestScope;
import sk.vyprava.model.SharedGoalData;
import sk.vyprava.party.PartyService;
import sk.vyprava.reward.RewardService;
import sk.vyprava.storage.ProgressStore;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.WeekFields;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

public final class QuestService {
    private final QuestRegistry registry;
    private final ProgressStore store;
    private final RewardService rewards;
    private final PartyService parties;
    private final LeaderboardService leaderboard;
    private final MiniMessage mini = MiniMessage.miniMessage();
    private final String prefix;
    private final ZoneId zone;
    private final int dailyCount;
    private final int weeklyCount;
    private final int longTermCount;
    private final int sharedCount;
    private final int partyCount;

    public QuestService(
            QuestRegistry registry,
            ProgressStore store,
            RewardService rewards,
            PartyService parties,
            LeaderboardService leaderboard,
            String prefix,
            ZoneId zone,
            int dailyCount,
            int weeklyCount,
            int longTermCount,
            int sharedCount,
            int partyCount
    ) {
        this.registry = registry;
        this.store = store;
        this.rewards = rewards;
        this.parties = parties;
        this.leaderboard = leaderboard;
        this.prefix = prefix;
        this.zone = zone;
        this.dailyCount = dailyCount;
        this.weeklyCount = weeklyCount;
        this.longTermCount = longTermCount;
        this.sharedCount = sharedCount;
        this.partyCount = partyCount;
        ensureSharedGoals();
    }

    public String today() {
        return LocalDate.now(zone).toString();
    }

    public String weekKey() {
        LocalDate now = LocalDate.now(zone);
        WeekFields wf = WeekFields.of(Locale.forLanguageTag("sk-SK"));
        return now.get(wf.weekBasedYear()) + "-W" + String.format("%02d", now.get(wf.weekOfWeekBasedYear()));
    }

    public String seasonKey() {
        LocalDate now = LocalDate.now(zone);
        int season = ((now.getMonthValue() - 1) / 3) + 1;
        return now.getYear() + "-S" + season;
    }

    public PlayerProgress progress(Player player) {
        PlayerProgress p = store.getOrCreate(player.getUniqueId(), player.getName());
        p.setName(player.getName());
        ensureDaily(player, p);
        ensureWeekly(player, p);
        ensureLongTerm(player, p);
        ensureSharedGoals();
        return p;
    }

    public void ensureDaily(Player player, PlayerProgress p) {
        String today = today();
        if (today.equals(p.dailyDate()) && !p.assignedDaily().isEmpty()) {
            return;
        }
        p.setDailyDate(today);
        p.assignedDaily().clear();
        p.dailyProgress().clear();
        p.completedDaily().clear();

        List<QuestDefinition> pool = shuffledEligible(registry.dailyPool(), p.currentChapterOrder());
        pool.stream().limit(dailyCount).forEach(q -> p.assignedDaily().add(q.id()));
        if (player.isOnline()) {
            player.sendMessage(mini.deserialize(prefix + "<green>Nové denné úlohy! <yellow>/vyprava denne</yellow></green>"));
        }
    }

    public void ensureWeekly(Player player, PlayerProgress p) {
        String week = weekKey();
        if (week.equals(p.weeklyKey()) && !p.assignedWeekly().isEmpty()) {
            return;
        }
        if (!week.equals(p.weeklyKey())) {
            p.setWeeklyPoints(0);
        }
        p.setWeeklyKey(week);
        p.assignedWeekly().clear();
        p.weeklyProgress().clear();
        p.completedWeekly().clear();

        List<QuestDefinition> pool = shuffledEligible(registry.weeklyPool(), p.currentChapterOrder());
        pool.stream().limit(weeklyCount).forEach(q -> p.assignedWeekly().add(q.id()));
        if (player.isOnline()) {
            player.sendMessage(mini.deserialize(prefix + "<aqua>Nové týždenné úlohy! <yellow>/vyprava tyzdenne</yellow></aqua>"));
        }
    }

    public void ensureLongTerm(Player player, PlayerProgress p) {
        String season = seasonKey();
        if (season.equals(p.longTermSeason()) && !p.assignedLongTerm().isEmpty()) {
            return;
        }
        p.setLongTermSeason(season);
        p.assignedLongTerm().clear();
        p.longTermProgress().clear();
        p.completedLongTerm().clear();

        List<QuestDefinition> pool = shuffledEligible(registry.longTermPool(), p.currentChapterOrder());
        pool.stream().limit(longTermCount).forEach(q -> p.assignedLongTerm().add(q.id()));
        if (player.isOnline()) {
            player.sendMessage(mini.deserialize(prefix + "<gold>Nové dlhodobé ciele! <yellow>/vyprava dlhodobe</yellow></gold>"));
        }
    }

    public void ensureSharedGoals() {
        String week = weekKey();
        boolean needsReset = store.allSharedGoals().isEmpty()
                || store.allSharedGoals().values().stream().noneMatch(g -> week.equals(g.periodKey()));
        if (!needsReset) {
            return;
        }
        store.clearShared();
        List<QuestDefinition> pool = new ArrayList<>(registry.sharedPool().values());
        if (pool.isEmpty()) {
            return;
        }
        Collections.shuffle(pool, ThreadLocalRandom.current());
        int count = Math.min(sharedCount, pool.size());
        for (int i = 0; i < count; i++) {
            QuestDefinition quest = pool.get(i);
            String id = "shared_" + week + "_" + quest.id();
            store.putShared(new SharedGoalData(id, quest.id(), week));
        }
    }

    private List<QuestDefinition> shuffledEligible(Map<String, QuestDefinition> source, int chapter) {
        List<QuestDefinition> eligible = source.values().stream()
                .filter(q -> q.minChapter() <= chapter)
                .toList();
        List<QuestDefinition> pool = new ArrayList<>(eligible);
        Collections.shuffle(pool, ThreadLocalRandom.current());
        return pool;
    }

    public void handleBreak(Player player, Material material) {
        bump(player, ObjectiveType.BREAK_BLOCK, material, null, null, 1);
    }

    public void handlePlace(Player player, Material material) {
        bump(player, ObjectiveType.PLACE_BLOCK, material, null, null, 1);
    }

    public void handleKill(Player player, EntityType type) {
        bump(player, ObjectiveType.KILL_ENTITY, null, type, null, 1);
    }

    public void handleCraft(Player player, Material material, int amount) {
        bump(player, ObjectiveType.CRAFT_ITEM, material, null, null, Math.max(1, amount));
    }

    public void handleSmelt(Player player, Material material, int amount) {
        bump(player, ObjectiveType.SMELT_ITEM, material, null, null, Math.max(1, amount));
    }

    public void handlePickup(Player player, Material material, int amount) {
        bump(player, ObjectiveType.PICKUP_ITEM, material, null, null, Math.max(1, amount));
    }

    public void handleWorld(Player player, World.Environment environment) {
        bump(player, ObjectiveType.ENTER_WORLD, null, null, environment.name(), 1);
    }

    private void bump(
            Player player,
            ObjectiveType type,
            Material material,
            EntityType entityType,
            String worldEnv,
            int amount
    ) {
        PlayerProgress p = progress(player);
        ChapterDefinition chapter = registry.chapterByOrder(p.currentChapterOrder()).orElse(null);
        if (chapter != null) {
            for (QuestDefinition quest : chapter.quests()) {
                if (matches(quest, type, material, entityType, worldEnv) && !p.isCompleted(QuestScope.CAMPAIGN, quest.id())) {
                    addCampaignProgress(player, p, quest, amount);
                }
            }
        }
        for (String dailyId : List.copyOf(p.assignedDaily())) {
            registry.dailyQuest(dailyId).ifPresent(quest -> {
                if (matches(quest, type, material, entityType, worldEnv) && !p.isCompleted(QuestScope.DAILY, quest.id())) {
                    addDailyProgress(player, p, quest, amount);
                }
            });
        }
        for (String weeklyId : List.copyOf(p.assignedWeekly())) {
            registry.weeklyQuest(weeklyId).ifPresent(quest -> {
                if (matches(quest, type, material, entityType, worldEnv) && !p.isCompleted(QuestScope.WEEKLY, quest.id())) {
                    addWeeklyProgress(player, p, quest, amount);
                }
            });
        }
        for (String longId : List.copyOf(p.assignedLongTerm())) {
            registry.longTermQuest(longId).ifPresent(quest -> {
                if (matches(quest, type, material, entityType, worldEnv) && !p.isCompleted(QuestScope.LONG_TERM, quest.id())) {
                    addLongTermProgress(player, p, quest, amount);
                }
            });
        }
        parties.findFor(player.getUniqueId()).ifPresent(party -> {
            if (party.activeQuestId() == null || party.questCompleted()) {
                return;
            }
            registry.partyQuest(party.activeQuestId()).ifPresent(quest -> {
                if (matches(quest, type, material, entityType, worldEnv)) {
                    addPartyProgress(player, party, quest, amount);
                }
            });
        });
        for (SharedGoalData goal : List.copyOf(store.allSharedGoals().values())) {
            if (goal.completed()) {
                continue;
            }
            registry.sharedQuest(goal.questId()).ifPresent(quest -> {
                if (matches(quest, type, material, entityType, worldEnv)) {
                    addSharedProgress(player, goal, quest, amount);
                }
            });
        }
    }

    private boolean matches(
            QuestDefinition quest,
            ObjectiveType type,
            Material material,
            EntityType entityType,
            String worldEnv
    ) {
        if (quest.type() != type) {
            return false;
        }
        return switch (type) {
            case BREAK_BLOCK, PLACE_BLOCK, CRAFT_ITEM, SMELT_ITEM, PICKUP_ITEM ->
                    material != null && type.matchesMaterial(quest.targets(), material);
            case KILL_ENTITY -> entityType != null && type.matchesEntity(quest.targets(), entityType);
            case ENTER_WORLD -> worldEnv != null && type.matchesWorld(quest.targets(), worldEnv);
        };
    }

    private void addCampaignProgress(Player player, PlayerProgress p, QuestDefinition quest, int amount) {
        int current = p.campaignProgress().getOrDefault(quest.id(), 0);
        int next = Math.min(quest.amount(), current + amount);
        p.campaignProgress().put(quest.id(), next);
        if (next >= quest.amount() && !p.completedCampaign().contains(quest.id())) {
            completeCampaignQuest(player, p, quest);
        }
    }

    private void addDailyProgress(Player player, PlayerProgress p, QuestDefinition quest, int amount) {
        int current = p.dailyProgress().getOrDefault(quest.id(), 0);
        int next = Math.min(quest.amount(), current + amount);
        p.dailyProgress().put(quest.id(), next);
        if (next >= quest.amount() && !p.completedDaily().contains(quest.id())) {
            p.completedDaily().add(quest.id());
            p.addPoints(quest.points());
            rewards.give(player, quest.rewards());
            player.sendMessage(mini.deserialize(prefix + "<green>Denná úloha splnená:</green> <yellow>"
                    + quest.name() + "</yellow> <gray>(+" + quest.points() + ")</gray>"));
            Bukkit.broadcast(mini.deserialize(prefix + "<white>" + player.getName()
                    + "</white> splnil denne: <yellow>" + quest.name() + "</yellow>"));
        }
    }

    private void addWeeklyProgress(Player player, PlayerProgress p, QuestDefinition quest, int amount) {
        int current = p.weeklyProgress().getOrDefault(quest.id(), 0);
        int next = Math.min(quest.amount(), current + amount);
        p.weeklyProgress().put(quest.id(), next);
        if (next >= quest.amount() && !p.completedWeekly().contains(quest.id())) {
            p.completedWeekly().add(quest.id());
            p.addPoints(quest.points());
            rewards.give(player, quest.rewards());
            player.sendMessage(mini.deserialize(prefix + "<aqua>Týždenná úloha splnená:</aqua> <yellow>"
                    + quest.name() + "</yellow> <gray>(+" + quest.points() + ")</gray>"));
            Bukkit.broadcast(mini.deserialize(prefix + "<white>" + player.getName()
                    + "</white> splnil týždenne: <yellow>" + quest.name() + "</yellow>"));
        }
    }

    private void addLongTermProgress(Player player, PlayerProgress p, QuestDefinition quest, int amount) {
        int current = p.longTermProgress().getOrDefault(quest.id(), 0);
        int next = Math.min(quest.amount(), current + amount);
        p.longTermProgress().put(quest.id(), next);
        if (next >= quest.amount() && !p.completedLongTerm().contains(quest.id())) {
            p.completedLongTerm().add(quest.id());
            p.addPoints(quest.points());
            rewards.give(player, quest.rewards());
            player.sendMessage(mini.deserialize(prefix + "<gold>Dlhodobý cieľ splnený:</gold> <yellow>"
                    + quest.name() + "</yellow> <gray>(+" + quest.points() + ")</gray>"));
            Bukkit.broadcast(mini.deserialize(prefix + "<white>" + player.getName()
                    + "</white> splnil dlhodobý cieľ: <yellow>" + quest.name() + "</yellow>"));
        }
    }

    private void addPartyProgress(Player player, PartyData party, QuestDefinition quest, int amount) {
        if (!today().equals(party.questDate())) {
            return;
        }
        int applied = Math.min(amount, Math.max(0, quest.amount() - party.questProgress()));
        if (applied <= 0) {
            return;
        }
        party.setQuestProgress(party.questProgress() + applied);
        party.contribution().merge(player.getUniqueId(), applied, Integer::sum);
        if (party.questProgress() >= quest.amount() && !party.questCompleted()) {
            party.setQuestCompleted(true);
            for (var memberId : party.members()) {
                Player member = Bukkit.getPlayer(memberId);
                PlayerProgress mp = store.getOrCreate(memberId, member != null ? member.getName() : "Unknown");
                mp.addPoints(quest.points());
                if (member != null && member.isOnline()) {
                    rewards.give(member, quest.rewards());
                    member.sendMessage(mini.deserialize(prefix + "<light_purple>Party úloha splnená:</light_purple> <yellow>"
                            + quest.name() + "</yellow>"));
                }
            }
            Bukkit.broadcast(mini.deserialize(prefix + "<light_purple>Partia <white>"
                    + party.name() + "</white> dokončila: <yellow>" + quest.name() + "</yellow></light_purple>"));
        }
    }

    private void addSharedProgress(Player player, SharedGoalData goal, QuestDefinition quest, int amount) {
        int remaining = Math.max(0, quest.amount() - goal.progress());
        int applied = Math.min(amount, remaining);
        if (applied <= 0 || goal.completed()) {
            return;
        }
        goal.contributions().merge(player.getUniqueId(), applied, Integer::sum);
        goal.setProgress(goal.progress() + applied);
        if (goal.progress() >= quest.amount() && !goal.completed()) {
            goal.setCompleted(true);
            for (UUID contributorId : goal.contributions().keySet()) {
                Player member = Bukkit.getPlayer(contributorId);
                PlayerProgress mp = store.getOrCreate(
                        contributorId,
                        member != null ? member.getName() : "Unknown"
                );
                mp.addPoints(quest.points());
                if (member != null && member.isOnline()) {
                    rewards.give(member, quest.rewards());
                    member.sendMessage(mini.deserialize(prefix + "<green>Spoločný cieľ splnený:</green> <yellow>"
                            + quest.name() + "</yellow>"));
                }
            }
            Bukkit.broadcast(mini.deserialize(prefix + "<green><bold>Spoločný cieľ dokončený!</bold></green> <yellow>"
                    + quest.name() + "</yellow>"));
        }
    }

    private void completeCampaignQuest(Player player, PlayerProgress p, QuestDefinition quest) {
        p.completedCampaign().add(quest.id());
        p.addPoints(quest.points());
        player.sendMessage(mini.deserialize(prefix + "<green>Úloha splnená:</green> <yellow>"
                + quest.name() + "</yellow> <gray>(+" + quest.points() + " bodov)</gray>"));
        registry.chapterById(quest.chapterId()).ifPresent(chapter -> tryCompleteChapter(player, p, chapter));
    }

    private void tryCompleteChapter(Player player, PlayerProgress p, ChapterDefinition chapter) {
        boolean allDone = chapter.quests().stream().allMatch(q -> p.completedCampaign().contains(q.id()));
        if (!allDone || p.completedChapters().contains(chapter.id())) {
            return;
        }
        p.completedChapters().add(chapter.id());
        p.addPoints(chapter.milestonePoints());
        rewards.give(player, chapter.milestoneRewards());
        player.sendMessage(mini.deserialize(prefix + "<gold><bold>Kapitola dokončená!</bold></gold> <gray>"
                + chapter.name() + " — " + chapter.milestoneName() + "</gray>"));
        Bukkit.broadcast(mini.deserialize(prefix + "<gold>" + player.getName()
                + "</gold> dokončil kapitolu <yellow>" + chapter.name() + "</yellow>!"));
        int next = chapter.order() + 1;
        if (registry.chapterByOrder(next).isPresent()) {
            p.setCurrentChapterOrder(next);
            player.sendMessage(mini.deserialize(prefix + "<aqua>Odomknutá nová kapitola!</aqua> <yellow>/vyprava kampan</yellow>"));
        }
    }

    public void assignPartyQuest(PartyData party, PlayerProgress leaderProgress) {
        String today = today();
        if (today.equals(party.questDate()) && party.activeQuestId() != null) {
            return;
        }
        List<QuestDefinition> eligible = registry.partyPool().values().stream()
                .filter(q -> q.minChapter() <= leaderProgress.currentChapterOrder())
                .toList();
        if (eligible.isEmpty()) {
            return;
        }
        List<QuestDefinition> pool = new ArrayList<>(eligible);
        Collections.shuffle(pool, ThreadLocalRandom.current());
        QuestDefinition chosen = pool.get(0);
        party.setActiveQuestId(chosen.id());
        party.setQuestDate(today);
        party.setQuestProgress(0);
        party.setQuestCompleted(false);
        party.contribution().clear();
    }

    public List<SharedGoalData> activeSharedGoals() {
        ensureSharedGoals();
        return store.allSharedGoals().values().stream()
                .sorted(Comparator.comparing(SharedGoalData::id))
                .toList();
    }

    public QuestRegistry registry() {
        return registry;
    }

    public ProgressStore store() {
        return store;
    }

    public PartyService parties() {
        return parties;
    }

    public LeaderboardService leaderboard() {
        return leaderboard;
    }

    public int partyCount() {
        return partyCount;
    }
}
