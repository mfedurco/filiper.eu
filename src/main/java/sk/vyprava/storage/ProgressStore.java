package sk.vyprava.storage;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.java.JavaPlugin;
import sk.vyprava.model.PartyData;
import sk.vyprava.model.PlayerProgress;
import sk.vyprava.model.SharedGoalData;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;

public final class ProgressStore {
    private final JavaPlugin plugin;
    private final Map<UUID, PlayerProgress> players = new ConcurrentHashMap<>();
    private final Map<String, PartyData> parties = new ConcurrentHashMap<>();
    private final Map<String, SharedGoalData> sharedGoals = new ConcurrentHashMap<>();
    private final File partiesFile;
    private String expeditionKey = "none";
    private boolean bound;

    public ProgressStore(JavaPlugin plugin) {
        this.plugin = plugin;
        this.partiesFile = new File(plugin.getDataFolder(), "data/parties.yml");
    }

    private File playersFile() {
        return new File(plugin.getDataFolder(), "data/expeditions/" + expeditionKey + "/players.yml");
    }

    private File sharedFile() {
        return new File(plugin.getDataFolder(), "data/expeditions/" + expeditionKey + "/shared.yml");
    }

    public synchronized void load() {
        parties.clear();
        loadParties();
        if (!bound) {
            return;
        }
        players.clear();
        sharedGoals.clear();
        loadPlayers();
        loadShared();
    }

    public synchronized void bindExpedition(String expeditionId, boolean resetPartyProgress) {
        String next = expeditionId == null || expeditionId.isBlank() ? "none" : expeditionId;
        if (bound && next.equals(expeditionKey)) {
            return;
        }
        if (bound) {
            savePlayers();
            saveShared();
        }
        expeditionKey = next;
        players.clear();
        sharedGoals.clear();
        loadPlayers();
        loadShared();
        bound = true;
        if (resetPartyProgress) {
            resetPartyQuests();
            saveParties();
        }
    }

    public synchronized String expeditionKey() {
        return bound ? expeditionKey : null;
    }

    public synchronized void save() {
        saveParties();
        if (!bound) {
            return;
        }
        savePlayers();
        saveShared();
    }

    private void resetPartyQuests() {
        for (PartyData party : parties.values()) {
            party.setActiveQuestId(null);
            party.setQuestDate("");
            party.setQuestProgress(0);
            party.setQuestCompleted(false);
            party.contribution().clear();
        }
    }

    public PlayerProgress getOrCreate(UUID uuid, String name) {
        return players.computeIfAbsent(uuid, id -> new PlayerProgress(id, name));
    }

    public Optional<PlayerProgress> find(UUID uuid) {
        return Optional.ofNullable(players.get(uuid));
    }

    public Map<UUID, PlayerProgress> allPlayers() {
        return players;
    }

    public Map<String, PartyData> allParties() {
        return parties;
    }

    public Map<String, SharedGoalData> allSharedGoals() {
        return sharedGoals;
    }

    public void putParty(PartyData party) {
        parties.put(party.id(), party);
    }

    public void removeParty(String id) {
        parties.remove(id);
    }

    public Optional<PartyData> party(String id) {
        return Optional.ofNullable(parties.get(id));
    }

    public void putShared(SharedGoalData goal) {
        sharedGoals.put(goal.id(), goal);
    }

    public void clearShared() {
        sharedGoals.clear();
    }

    public Optional<SharedGoalData> shared(String id) {
        return Optional.ofNullable(sharedGoals.get(id));
    }

    private void loadPlayers() {
        if (!playersFile().exists()) {
            return;
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(playersFile());
        ConfigurationSection root = yaml.getConfigurationSection("players");
        if (root == null) {
            return;
        }
        for (String key : root.getKeys(false)) {
            ConfigurationSection s = root.getConfigurationSection(key);
            if (s == null) {
                continue;
            }
            UUID uuid = UUID.fromString(key);
            PlayerProgress p = new PlayerProgress(uuid, s.getString("name", "Unknown"));
            p.setCurrentChapterOrder(s.getInt("chapter", 1));
            p.setTotalPoints(s.getInt("totalPoints", 0));
            p.setWeeklyPoints(s.getInt("weeklyPoints", 0));
            p.setDailyDate(s.getString("dailyDate", ""));
            p.setWeeklyKey(s.getString("weeklyKey", ""));
            p.setLongTermSeason(s.getString("longTermSeason", ""));
            p.setPartyId(s.getString("partyId", null));
            p.setLanguage(s.getString("language", null));
            addAll(s.getStringList("completedCampaign"), p.completedCampaign());
            addAll(s.getStringList("completedChapters"), p.completedChapters());
            addAll(s.getStringList("completedDaily"), p.completedDaily());
            addAll(s.getStringList("assignedDaily"), p.assignedDaily());
            addAll(s.getStringList("completedWeekly"), p.completedWeekly());
            addAll(s.getStringList("assignedWeekly"), p.assignedWeekly());
            addAll(s.getStringList("completedLongTerm"), p.completedLongTerm());
            addAll(s.getStringList("assignedLongTerm"), p.assignedLongTerm());
            readIntMap(s.getConfigurationSection("campaignProgress"), p.campaignProgress());
            readIntMap(s.getConfigurationSection("dailyProgress"), p.dailyProgress());
            readIntMap(s.getConfigurationSection("weeklyProgress"), p.weeklyProgress());
            readIntMap(s.getConfigurationSection("longTermProgress"), p.longTermProgress());
            players.put(uuid, p);
        }
    }

    private void savePlayers() {
        YamlConfiguration yaml = new YamlConfiguration();
        for (PlayerProgress p : players.values()) {
            String path = "players." + p.uuid();
            yaml.set(path + ".name", p.name());
            yaml.set(path + ".chapter", p.currentChapterOrder());
            yaml.set(path + ".totalPoints", p.totalPoints());
            yaml.set(path + ".weeklyPoints", p.weeklyPoints());
            yaml.set(path + ".dailyDate", p.dailyDate());
            yaml.set(path + ".weeklyKey", p.weeklyKey());
            yaml.set(path + ".longTermSeason", p.longTermSeason());
            yaml.set(path + ".partyId", p.partyId());
            yaml.set(path + ".language", p.language());
            yaml.set(path + ".completedCampaign", new ArrayList<>(p.completedCampaign()));
            yaml.set(path + ".completedChapters", new ArrayList<>(p.completedChapters()));
            yaml.set(path + ".completedDaily", new ArrayList<>(p.completedDaily()));
            yaml.set(path + ".assignedDaily", new ArrayList<>(p.assignedDaily()));
            yaml.set(path + ".completedWeekly", new ArrayList<>(p.completedWeekly()));
            yaml.set(path + ".assignedWeekly", new ArrayList<>(p.assignedWeekly()));
            yaml.set(path + ".completedLongTerm", new ArrayList<>(p.completedLongTerm()));
            yaml.set(path + ".assignedLongTerm", new ArrayList<>(p.assignedLongTerm()));
            writeIntMap(yaml, path + ".campaignProgress", p.campaignProgress());
            writeIntMap(yaml, path + ".dailyProgress", p.dailyProgress());
            writeIntMap(yaml, path + ".weeklyProgress", p.weeklyProgress());
            writeIntMap(yaml, path + ".longTermProgress", p.longTermProgress());
        }
        try {
            saveAtomic(yaml, playersFile());
        } catch (IOException e) {
            plugin.getLogger().log(Level.SEVERE, "Could not save players.yml", e);
        }
    }

    private void loadParties() {
        if (!partiesFile.exists()) {
            return;
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(partiesFile);
        ConfigurationSection root = yaml.getConfigurationSection("parties");
        if (root == null) {
            return;
        }
        for (String id : root.getKeys(false)) {
            ConfigurationSection s = root.getConfigurationSection(id);
            if (s == null) {
                continue;
            }
            UUID leader = UUID.fromString(s.getString("leader"));
            PartyData party = new PartyData(id, s.getString("name", id), leader);
            party.members().clear();
            for (String member : s.getStringList("members")) {
                party.members().add(UUID.fromString(member));
            }
            party.setActiveQuestId(s.getString("activeQuestId", null));
            party.setQuestDate(s.getString("questDate", ""));
            party.setQuestProgress(s.getInt("questProgress", 0));
            party.setQuestCompleted(s.getBoolean("questCompleted", false));
            ConfigurationSection contrib = s.getConfigurationSection("contribution");
            if (contrib != null) {
                for (String key : contrib.getKeys(false)) {
                    party.contribution().put(UUID.fromString(key), contrib.getInt(key));
                }
            }
            parties.put(id, party);
        }
    }

    private void saveParties() {
        YamlConfiguration yaml = new YamlConfiguration();
        for (PartyData party : parties.values()) {
            String path = "parties." + party.id();
            yaml.set(path + ".name", party.name());
            yaml.set(path + ".leader", party.leader().toString());
            List<String> members = new ArrayList<>();
            for (UUID member : party.members()) {
                members.add(member.toString());
            }
            yaml.set(path + ".members", members);
            yaml.set(path + ".activeQuestId", party.activeQuestId());
            yaml.set(path + ".questDate", party.questDate());
            yaml.set(path + ".questProgress", party.questProgress());
            yaml.set(path + ".questCompleted", party.questCompleted());
            for (Map.Entry<UUID, Integer> e : party.contribution().entrySet()) {
                yaml.set(path + ".contribution." + e.getKey(), e.getValue());
            }
        }
        try {
            saveAtomic(yaml, partiesFile);
        } catch (IOException e) {
            plugin.getLogger().log(Level.SEVERE, "Could not save parties.yml", e);
        }
    }

    private void loadShared() {
        if (!sharedFile().exists()) {
            return;
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(sharedFile());
        ConfigurationSection root = yaml.getConfigurationSection("goals");
        if (root == null) {
            return;
        }
        for (String id : root.getKeys(false)) {
            ConfigurationSection s = root.getConfigurationSection(id);
            if (s == null) {
                continue;
            }
            SharedGoalData goal = new SharedGoalData(id, s.getString("questId", ""), s.getString("periodKey", ""));
            goal.setProgress(s.getInt("progress", 0));
            goal.setCompleted(s.getBoolean("completed", false));
            ConfigurationSection contrib = s.getConfigurationSection("contributions");
            if (contrib != null) {
                for (String key : contrib.getKeys(false)) {
                    goal.contributions().put(UUID.fromString(key), contrib.getInt(key));
                }
            }
            sharedGoals.put(id, goal);
        }
    }

    private void saveShared() {
        YamlConfiguration yaml = new YamlConfiguration();
        for (SharedGoalData goal : sharedGoals.values()) {
            String path = "goals." + goal.id();
            yaml.set(path + ".questId", goal.questId());
            yaml.set(path + ".periodKey", goal.periodKey());
            yaml.set(path + ".progress", goal.progress());
            yaml.set(path + ".completed", goal.completed());
            for (Map.Entry<UUID, Integer> e : goal.contributions().entrySet()) {
                yaml.set(path + ".contributions." + e.getKey(), e.getValue());
            }
        }
        try {
            saveAtomic(yaml, sharedFile());
        } catch (IOException e) {
            plugin.getLogger().log(Level.SEVERE, "Could not save shared.yml", e);
        }
    }

    private static void addAll(List<String> source, java.util.Set<String> target) {
        if (source != null) {
            target.addAll(source);
        }
    }

    private static void readIntMap(ConfigurationSection section, Map<String, Integer> target) {
        if (section == null) {
            return;
        }
        for (String key : section.getKeys(false)) {
            target.put(key, section.getInt(key));
        }
    }

    private static void writeIntMap(YamlConfiguration yaml, String path, Map<String, Integer> map) {
        for (Map.Entry<String, Integer> e : map.entrySet()) {
            yaml.set(path + "." + e.getKey(), e.getValue());
        }
    }

    private static void saveAtomic(YamlConfiguration yaml, File file) throws IOException {
        File parent = file.getParentFile();
        if (parent != null) {
            Files.createDirectories(parent.toPath());
        }
        java.nio.file.Path path = file.toPath();
        java.nio.file.Path temporary = path.resolveSibling(path.getFileName() + ".tmp");
        Files.writeString(temporary, yaml.saveToString(), StandardCharsets.UTF_8);
        try {
            Files.move(
                    temporary,
                    path,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING
            );
        } catch (java.nio.file.AtomicMoveNotSupportedException ignored) {
            Files.move(temporary, path, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
