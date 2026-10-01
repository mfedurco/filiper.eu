package sk.vyprava.quest;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.java.JavaPlugin;
import sk.vyprava.model.ChapterDefinition;
import sk.vyprava.model.ObjectiveType;
import sk.vyprava.model.QuestDefinition;
import sk.vyprava.model.QuestScope;
import sk.vyprava.model.RewardItem;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public final class QuestRegistry {
    private final JavaPlugin plugin;
    private final List<ChapterDefinition> chapters = new ArrayList<>();
    private final Map<String, QuestDefinition> campaignQuests = new HashMap<>();
    private final Map<String, QuestDefinition> dailyPool = new HashMap<>();
    private final Map<String, QuestDefinition> weeklyPool = new HashMap<>();
    private final Map<String, QuestDefinition> longTermPool = new HashMap<>();
    private final Map<String, QuestDefinition> partyPool = new HashMap<>();
    private final Map<String, QuestDefinition> sharedPool = new HashMap<>();

    public QuestRegistry(JavaPlugin plugin) {
        this.plugin = plugin;
    }

    public void load() {
        chapters.clear();
        campaignQuests.clear();
        dailyPool.clear();
        weeklyPool.clear();
        longTermPool.clear();
        partyPool.clear();
        sharedPool.clear();

        plugin.saveResource("quests/campaign.yml", false);
        plugin.saveResource("quests/daily.yml", false);
        plugin.saveResource("quests/weekly.yml", false);
        plugin.saveResource("quests/longterm.yml", false);
        plugin.saveResource("quests/party.yml", false);
        plugin.saveResource("quests/shared.yml", false);

        loadCampaign(new File(plugin.getDataFolder(), "quests/campaign.yml"));
        loadPool(new File(plugin.getDataFolder(), "quests/daily.yml"), dailyPool, QuestScope.DAILY);
        loadPool(new File(plugin.getDataFolder(), "quests/weekly.yml"), weeklyPool, QuestScope.WEEKLY);
        loadPool(new File(plugin.getDataFolder(), "quests/longterm.yml"), longTermPool, QuestScope.LONG_TERM);
        loadPool(new File(plugin.getDataFolder(), "quests/party.yml"), partyPool, QuestScope.PARTY);
        loadPool(new File(plugin.getDataFolder(), "quests/shared.yml"), sharedPool, QuestScope.SHARED);
    }

    private void loadCampaign(File file) {
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(file);
        ConfigurationSection root = yaml.getConfigurationSection("chapters");
        if (root == null) {
            return;
        }
        for (String chapterId : root.getKeys(false)) {
            ConfigurationSection section = root.getConfigurationSection(chapterId);
            if (section == null) {
                continue;
            }
            List<QuestDefinition> quests = new ArrayList<>();
            ConfigurationSection questSection = section.getConfigurationSection("quests");
            if (questSection != null) {
                for (String questId : questSection.getKeys(false)) {
                    ConfigurationSection q = questSection.getConfigurationSection(questId);
                    if (q == null) {
                        continue;
                    }
                    QuestDefinition def = parseQuest(questId, q, QuestScope.CAMPAIGN, chapterId, section.getInt("order", 1));
                    quests.add(def);
                    campaignQuests.put(questId, def);
                }
            }
            ConfigurationSection milestone = section.getConfigurationSection("milestone");
            String milestoneName = milestone != null ? milestone.getString("name", "Milník") : "Milník";
            List<RewardItem> milestoneRewards = milestone != null
                    ? RewardItem.parseList(milestone.getMapList("rewards"))
                    : List.of();
            int milestonePoints = milestone != null ? milestone.getInt("points", 0) : 0;

            chapters.add(new ChapterDefinition(
                    chapterId,
                    section.getInt("order", 1),
                    section.getString("name", chapterId),
                    section.getString("description", ""),
                    quests,
                    milestoneName,
                    milestoneRewards,
                    milestonePoints
            ));
        }
        chapters.sort((a, b) -> Integer.compare(a.order(), b.order()));
    }

    private void loadPool(File file, Map<String, QuestDefinition> target, QuestScope scope) {
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(file);
        ConfigurationSection root = yaml.getConfigurationSection("pool");
        if (root == null) {
            return;
        }
        for (String questId : root.getKeys(false)) {
            ConfigurationSection q = root.getConfigurationSection(questId);
            if (q == null) {
                continue;
            }
            target.put(questId, parseQuest(questId, q, scope, null, q.getInt("min-chapter", 1)));
        }
    }

    private QuestDefinition parseQuest(String id, ConfigurationSection q, QuestScope scope, String chapterId, int minChapterFallback) {
        ObjectiveType type = ObjectiveType.from(q.getString("type", "BREAK_BLOCK"));
        List<String> targets = q.getStringList("targets");
        return new QuestDefinition(
                id,
                q.getString("name", id),
                q.getString("description", ""),
                type,
                targets,
                q.getInt("amount", 1),
                q.getInt("points", 0),
                q.getInt("min-chapter", minChapterFallback),
                RewardItem.parseList(q.getMapList("rewards")),
                scope,
                chapterId
        );
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
