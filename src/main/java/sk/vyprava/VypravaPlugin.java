package sk.vyprava;

import org.bukkit.command.CommandSender;
import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;
import sk.vyprava.command.VypravaCommand;
import sk.vyprava.db.DatabaseClient;
import sk.vyprava.db.DatabaseSettings;
import sk.vyprava.db.ExpeditionRecord;
import sk.vyprava.db.GoalMeta;
import sk.vyprava.db.LogSafe;
import sk.vyprava.db.OutboxFlusher;
import sk.vyprava.db.PartySnapshot;
import sk.vyprava.db.PlayerSnapshot;
import sk.vyprava.db.ProgressOutbox;
import sk.vyprava.db.QuestRecord;
import sk.vyprava.db.QuestRow;
import sk.vyprava.db.SharedSnapshot;
import sk.vyprava.leaderboard.LeaderboardService;
import sk.vyprava.listener.QuestListener;
import sk.vyprava.model.PartyData;
import sk.vyprava.model.PlayerProgress;
import sk.vyprava.model.SharedGoalData;
import sk.vyprava.party.PartyService;
import sk.vyprava.quest.CatalogMapper;
import sk.vyprava.quest.QuestRegistry;
import sk.vyprava.quest.QuestService;
import sk.vyprava.reward.RewardService;
import sk.vyprava.storage.ProgressStore;
import sk.vyprava.storage.ProgressSync;
import sk.vyprava.web.WebApiServer;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public final class VypravaPlugin extends JavaPlugin implements ProgressSync {
    private ProgressStore store;
    private QuestRegistry registry;
    private QuestService quests;
    private WebApiServer webApi;
    private ProgressOutbox outbox;
    private volatile DatabaseClient database;
    private volatile String activeExpeditionId;
    private volatile ExpeditionRecord activeExpedition;
    private volatile Map<String, GoalMeta> goalCatalog = Map.of();
    private final AtomicBoolean flushing = new AtomicBoolean();
    private boolean timersStarted;
    private boolean loggedDisabled;
    private boolean loggedInactive;
    private boolean loggedDown;
    private boolean loggedUp;
    private int lastQuestCount = -1;
    private String replayedFor;
    private long lastDbWarningAt;
    private String prefix = "";

    @Override
    public void onEnable() {
        saveDefaultConfig();
        store = new ProgressStore(this);
        store.load();
        registry = new QuestRegistry();
        outbox = new ProgressOutbox();
        try {
            outbox.load(outboxPath());
        } catch (IOException e) {
            getLogger().warning("Could not load the YAML outbox: " + e.getMessage());
        }
        reloadPrefix();
        quests = buildQuests();
        quests.setSync(this);

        getServer().getPluginManager().registerEvents(new QuestListener(this), this);
        getServer().getPluginManager().registerEvents(new sk.vyprava.menu.VypravaChestMenu(this), this);
        VypravaCommand command = new VypravaCommand(this);
        PluginCommand cmd = getCommand("vyprava");
        if (cmd != null) {
            cmd.setExecutor(command);
            cmd.setTabCompleter(command);
        }
        startWeb();
        startTimers();
        getServer().getAsyncScheduler().runNow(this, task -> refreshExpedition(null));
    }

    @Override
    public void onDisable() {
        ClassLoader previous = Thread.currentThread().getContextClassLoader();
        Thread.currentThread().setContextClassLoader(getClass().getClassLoader());
        try {
            if (outbox != null && outbox.hasPending()) {
                doFlush();
            }
        } finally {
            Thread.currentThread().setContextClassLoader(previous);
        }
        if (webApi != null) {
            webApi.stop();
            webApi = null;
        }
        if (store != null) {
            store.save();
        }
        if (outbox != null) {
            try {
                outbox.save(outboxPath());
            } catch (IOException e) {
                getLogger().warning("Could not save the YAML outbox: " + e.getMessage());
            }
        }
        closeDatabase();
    }

    public void reloadFromDatabase(CommandSender sender) {
        reloadConfig();
        reloadPrefix();
        quests = buildQuests();
        quests.setSync(this);
        startWeb();
        if (sender != null) {
            sender.sendMessage("Výprava sa načítava z databázy…");
        }
        getServer().getAsyncScheduler().runNow(this, task -> refreshExpedition(() -> {
            if (sender != null) {
                sender.sendMessage("Výprava reload OK.");
            }
        }));
    }

    public QuestService quests() {
        return quests;
    }

    public String prefix() {
        return prefix;
    }

    public ExpeditionRecord activeExpedition() {
        return activeExpedition;
    }

    @Override
    public void onPlayer(PlayerProgress player) {
        String expeditionId = activeExpeditionId;
        if (expeditionId == null || outbox == null) {
            return;
        }
        outbox.markPlayer(expeditionId, capture(player));
        persistQueue();
        scheduleFlush();
    }

    @Override
    public void onShared(SharedGoalData goal) {
        String expeditionId = activeExpeditionId;
        if (expeditionId == null || outbox == null) {
            return;
        }
        outbox.markShared(expeditionId, new SharedSnapshot(
                goal.id(),
                goal.progress(),
                goal.completed(),
                goal.periodKey(),
                0,
                true,
                new LinkedHashMap<>(goal.contributions())
        ));
        persistQueue();
        scheduleFlush();
    }

    @Override
    public void onParty(PartyData party) {
        String expeditionId = activeExpeditionId;
        if (expeditionId == null || outbox == null || party.activeQuestId() == null) {
            return;
        }
        outbox.markParty(expeditionId, new PartySnapshot(
                party.id(),
                party.name(),
                party.leader(),
                party.activeQuestId(),
                party.questProgress(),
                party.questCompleted(),
                0,
                true,
                new LinkedHashMap<>(party.contribution())
        ));
        persistQueue();
        scheduleFlush();
    }

    private void refreshExpedition(Runnable after) {
        ClassLoader previous = Thread.currentThread().getContextClassLoader();
        Thread.currentThread().setContextClassLoader(getClass().getClassLoader());
        try {
            DatabaseSettings settings = DatabaseSettings.from(getConfig(), getDataFolder().toPath());
            if (!settings.enabled()) {
                finish(() -> {
                    bindRememberedProgress();
                    if (!loggedDisabled) {
                        getLogger().warning("Postgres is disabled (database.enabled: false). Quest definitions live in the database, so quests are not tracked. Player progress stays in YAML.");
                        loggedDisabled = true;
                    }
                }, after);
                return;
            }
            loggedDisabled = false;
            if (settings.serverId() == null) {
                finish(() -> {
                    registry.clear();
                    goalCatalog = Map.of();
                    activeExpeditionId = null;
                    activeExpedition = null;
                    warnDb("server-id is blank. Database writes are refused and this server expedition is not loaded.");
                }, after);
                return;
            }
            if (settings.jdbcUrl() == null) {
                finish(() -> warnDb("database.enabled is true, but the direct JDBC URL is missing (database.jdbc-url, DATABASE_URL_UNPOOLED, or .env.local)."), after);
                return;
            }
            DatabaseClient db = openDatabase(settings.jdbcUrl());
            if (db == null) {
                finish(this::noteDatabaseDown, after);
                return;
            }
            try {
                var active = db.syncSchedule(Instant.now(), settings.serverId());
                List<QuestRecord> records = active.isPresent()
                        ? db.loadQuests(active.get().id(), settings.serverId())
                        : List.of();
                finish(() -> applyLoaded(active.orElse(null), records), after);
            } catch (Exception e) {
                warnDb("Failed to load the expedition: " + LogSafe.message(e));
                closeDatabase();
                finish(this::noteDatabaseDown, after);
            }
        } finally {
            Thread.currentThread().setContextClassLoader(previous);
        }
    }

    private void applyLoaded(ExpeditionRecord expedition, List<QuestRecord> records) {
        if (expedition == null) {
            registry.clear();
            goalCatalog = Map.of();
            activeExpeditionId = null;
            activeExpedition = null;
            if (!loggedInactive) {
                getLogger().warning("No expedition is active. Quests are not tracked.");
                loggedInactive = true;
            }
            return;
        }
        loggedInactive = false;
        loggedDown = false;
        String newId = expedition.id().toString();
        String remembered = readLastExpedition();
        boolean switching = remembered != null && !remembered.equals(newId);
        boolean changed = activeExpeditionId == null || !activeExpeditionId.equals(newId);
        if (!newId.equals(store.expeditionKey())) {
            store.bindExpedition(newId, switching);
            changed = true;
        }
        activeExpeditionId = newId;
        activeExpedition = expedition;
        writeLastExpedition(newId);
        if (!newId.equals(replayedFor)) {
            replay(newId);
            replayedFor = newId;
            store.save();
        }
        goalCatalog = new CatalogMapper().install(registry, records);
        quests.onCatalogUpdated();
        if (!loggedUp) {
            loggedUp = true;
            String serverId = DatabaseSettings.from(getConfig(), getDataFolder().toPath()).serverId();
            getLogger().info("Vyprava is up. server-id=" + (serverId == null || serverId.isBlank() ? "(none)" : serverId)
                    + " active-expedition=" + newId);
        } else if (changed || records.size() != lastQuestCount) {
            getLogger().info("Active expedition is " + newId + " (" + records.size() + " quests).");
        }
        lastQuestCount = records.size();
        if (switching) {
            getLogger().info("Previous expedition ended. Players start expedition " + newId + " at zero.");
        }
        if (outbox.hasPending()) {
            scheduleFlush();
        }
    }

    private void bindRememberedProgress() {
        String remembered = readLastExpedition();
        if (remembered == null) {
            return;
        }
        if (!remembered.equals(store.expeditionKey())) {
            store.bindExpedition(remembered, false);
        }
        activeExpeditionId = remembered;
        if (!remembered.equals(replayedFor)) {
            replay(remembered);
            replayedFor = remembered;
        }
    }

    private void noteDatabaseDown() {
        bindRememberedProgress();
        if (!registry.hasQuests() && !loggedDown) {
            getLogger().warning("Database is unavailable. Quests will not start until an expedition loads. Pending progress stays in the YAML queue.");
            loggedDown = true;
        }
    }

    private void replay(String expeditionId) {
        for (PlayerSnapshot snapshot : outbox.pendingPlayers(expeditionId)) {
            apply(store.getOrCreate(snapshot.uuid(), snapshot.name()), snapshot);
        }
        for (SharedSnapshot snapshot : outbox.pendingShared(expeditionId)) {
            SharedGoalData goal = new SharedGoalData(snapshot.questKey(), snapshot.questKey(), snapshot.periodKey());
            goal.setProgress(snapshot.progress());
            goal.setCompleted(snapshot.completed());
            goal.contributions().putAll(snapshot.contributions());
            store.putShared(goal);
        }
        for (PartySnapshot snapshot : outbox.pendingParties(expeditionId)) {
            store.party(snapshot.partyId()).ifPresent(party -> {
                if (!snapshot.name().isBlank()) {
                    party.setName(snapshot.name());
                }
                if (snapshot.leader() != null) {
                    party.setLeader(snapshot.leader());
                }
                party.setActiveQuestId(snapshot.questKey());
                party.setQuestProgress(snapshot.progress());
                party.setQuestCompleted(snapshot.completed());
                party.contribution().clear();
                party.contribution().putAll(snapshot.contributions());
            });
        }
    }

    private void scheduleFlush() {
        getServer().getAsyncScheduler().runDelayed(this, task -> flushGuarded(), 1, TimeUnit.SECONDS);
    }

    private void flushGuarded() {
        if (!flushing.compareAndSet(false, true)) {
            return;
        }
        ClassLoader previous = Thread.currentThread().getContextClassLoader();
        Thread.currentThread().setContextClassLoader(getClass().getClassLoader());
        try {
            doFlush();
        } finally {
            Thread.currentThread().setContextClassLoader(previous);
            flushing.set(false);
            if (outbox != null && outbox.hasPending() && databaseEnabled()) {
                getServer().getAsyncScheduler().runDelayed(this, task -> flushGuarded(), 1, TimeUnit.SECONDS);
            }
        }
    }

    private void doFlush() {
        if (outbox == null || !outbox.hasPending()) {
            return;
        }
        DatabaseSettings settings = DatabaseSettings.from(getConfig(), getDataFolder().toPath());
        if (!settings.enabled() || settings.jdbcUrl() == null) {
            return;
        }
        if (settings.serverId() == null) {
            warnDb("server-id is blank. Database writes are refused.");
            return;
        }
        DatabaseClient db = openDatabase(settings.jdbcUrl());
        if (db == null) {
            return;
        }
        String serverId = settings.serverId();
        try {
            new OutboxFlusher().flush(outbox, batch -> db.push(batch, goalCatalog, serverId));
            outbox.save(outboxPath());
            loggedDown = false;
        } catch (Exception e) {
            warnDb("Progress write to Postgres failed. Rows stay queued: " + LogSafe.message(e));
            closeDatabase();
        }
    }

    private boolean databaseEnabled() {
        return getConfig().getBoolean("database.enabled", false);
    }

    private DatabaseClient openDatabase(String url) {
        DatabaseClient current = database;
        if (current != null) {
            try {
                current.ping();
                return current;
            } catch (Exception e) {
                closeDatabase();
            }
        }
        try {
            DatabaseClient opened = DatabaseClient.open(url);
            opened.ping();
            database = opened;
            return opened;
        } catch (Exception e) {
            warnDb("Postgres connection failed: " + LogSafe.message(e));
            return null;
        }
    }

    private void closeDatabase() {
        DatabaseClient current = database;
        database = null;
        if (current != null) {
            current.close();
        }
    }

    private void persistQueue() {
        try {
            outbox.save(outboxPath());
        } catch (IOException e) {
            getLogger().warning("Could not save the YAML outbox: " + e.getMessage());
        }
        store.save();
    }

    private void finish(Runnable work, Runnable after) {
        Runnable task = () -> {
            if (work != null) {
                work.run();
            }
            if (after != null) {
                after.run();
            }
        };
        if (getServer().isPrimaryThread()) {
            task.run();
            return;
        }
        getServer().getGlobalRegionScheduler().run(this, scheduled -> task.run());
    }

    private void warnDb(String message) {
        long now = System.currentTimeMillis();
        if (now - lastDbWarningAt < 60_000) {
            return;
        }
        lastDbWarningAt = now;
        getLogger().warning(message);
    }

    private QuestService buildQuests() {
        ZoneId zone;
        try {
            zone = ZoneId.of(getConfig().getString("timezone", "Europe/Bratislava"));
        } catch (Exception e) {
            zone = ZoneId.of("Europe/Bratislava");
        }
        return new QuestService(
                registry,
                store,
                new RewardService(prefix, getConfig().getString("messages.reward-given", "<aqua>Odmena:</aqua> <white>{reward}</white>")),
                new PartyService(store),
                new LeaderboardService(store),
                prefix,
                getConfig().getString("messages.quest-complete", "<green>Úloha splnená:</green> <yellow>{quest}</yellow> <gray>(+{points} bodov)</gray>"),
                getConfig().getString("messages.shared-complete", "<green><bold>Spoločný cieľ dokončený!</bold></green> <yellow>{quest}</yellow>"),
                getConfig().getString("messages.chapter-complete", "<gold><bold>Kapitola dokončená!</bold></gold> <gray>{chapter}</gray>"),
                zone,
                getConfig().getInt("daily-quest-count", 3),
                getConfig().getInt("weekly-quest-count", 2),
                getConfig().getInt("longterm-quest-count", 2),
                getConfig().getInt("shared-quest-count", 2),
                getConfig().getInt("party-quest-count", 1)
        );
    }

    private void reloadPrefix() {
        prefix = getConfig().getString("messages.prefix", "<gold><bold>Výprava</bold></gold> <dark_gray>»</dark_gray> ");
    }

    private void startWeb() {
        if (webApi != null) {
            webApi.stop();
            webApi = null;
        }
        if (!getConfig().getBoolean("web.enabled", true)) {
            return;
        }
        int port = getConfig().getInt("web.port", 8765);
        String bind = getConfig().getString("web.bind", "0.0.0.0");
        try {
            webApi = new WebApiServer(quests, getConfig(), getLogger());
            webApi.start(port, bind);
        } catch (Exception e) {
            getLogger().severe("Web API failed to start: " + e.getMessage());
        }
    }

    private void startTimers() {
        if (timersStarted) {
            return;
        }
        timersStarted = true;
        getServer().getAsyncScheduler().runAtFixedRate(this, task -> refreshExpedition(null), 60, 60, TimeUnit.SECONDS);
        getServer().getAsyncScheduler().runAtFixedRate(this, task -> {
            if (outbox != null && outbox.hasPending()) {
                flushGuarded();
            }
        }, 10, 10, TimeUnit.SECONDS);
        getServer().getAsyncScheduler().runAtFixedRate(this, task -> {
            if (store != null) {
                store.save();
            }
        }, 5, 5, TimeUnit.MINUTES);
    }

    private PlayerSnapshot capture(PlayerProgress player) {
        Map<String, QuestRow> quests = new LinkedHashMap<>();
        addQuests(quests, "campaign", player.campaignProgress(), player.completedCampaign(), Set.of());
        addQuests(quests, "daily", player.dailyProgress(), player.completedDaily(), player.assignedDaily());
        addQuests(quests, "weekly", player.weeklyProgress(), player.completedWeekly(), player.assignedWeekly());
        addQuests(quests, "long_term", player.longTermProgress(), player.completedLongTerm(), player.assignedLongTerm());
        return new PlayerSnapshot(
                player.uuid(),
                player.name(),
                player.currentChapterOrder(),
                player.totalPoints(),
                player.weeklyPoints(),
                player.partyId(),
                player.dailyDate(),
                player.weeklyKey(),
                player.longTermSeason(),
                0,
                true,
                quests,
                player.assignedDaily(),
                player.assignedWeekly(),
                player.assignedLongTerm(),
                player.completedCampaign(),
                player.completedDaily(),
                player.completedWeekly(),
                player.completedLongTerm(),
                player.completedChapters()
        );
    }

    private static void addQuests(
            Map<String, QuestRow> target,
            String kind,
            Map<String, Integer> progress,
            Set<String> completed,
            Set<String> assigned
    ) {
        Set<String> keys = new LinkedHashSet<>();
        keys.addAll(progress.keySet());
        keys.addAll(completed);
        keys.addAll(assigned);
        for (String key : keys) {
            target.put(key, new QuestRow(kind, progress.getOrDefault(key, 0), completed.contains(key)));
        }
    }

    private static void apply(PlayerProgress player, PlayerSnapshot snapshot) {
        player.setName(snapshot.name());
        player.setCurrentChapterOrder(snapshot.chapter());
        player.setTotalPoints(snapshot.totalPoints());
        player.setWeeklyPoints(snapshot.weeklyPoints());
        player.setPartyId(snapshot.partyId());
        player.setDailyDate(snapshot.dailyDate());
        player.setWeeklyKey(snapshot.weeklyKey());
        player.setLongTermSeason(snapshot.longTermSeason());
        copyScope(player.campaignProgress(), player.completedCampaign(), snapshot, "campaign", snapshot.completedCampaign());
        copyScope(player.dailyProgress(), player.completedDaily(), snapshot, "daily", snapshot.completedDaily());
        copyScope(player.weeklyProgress(), player.completedWeekly(), snapshot, "weekly", snapshot.completedWeekly());
        copyScope(player.longTermProgress(), player.completedLongTerm(), snapshot, "long_term", snapshot.completedLongTerm());
        player.assignedDaily().clear();
        player.assignedDaily().addAll(snapshot.assignedDaily());
        player.assignedWeekly().clear();
        player.assignedWeekly().addAll(snapshot.assignedWeekly());
        player.assignedLongTerm().clear();
        player.assignedLongTerm().addAll(snapshot.assignedLongTerm());
        player.completedChapters().clear();
        player.completedChapters().addAll(snapshot.completedChapters());
    }

    private static void copyScope(
            Map<String, Integer> progress,
            Set<String> completed,
            PlayerSnapshot snapshot,
            String kind,
            Set<String> completedSource
    ) {
        progress.clear();
        completed.clear();
        completed.addAll(completedSource);
        for (Map.Entry<String, QuestRow> entry : snapshot.quests().entrySet()) {
            if (kind.equals(entry.getValue().goalKind())) {
                progress.put(entry.getKey(), entry.getValue().current());
                if (entry.getValue().completed()) {
                    completed.add(entry.getKey());
                }
            }
        }
    }

    private Path outboxPath() {
        return getDataFolder().toPath().resolve("data/outbox.yml");
    }

    private Path lastExpeditionPath() {
        return getDataFolder().toPath().resolve("data/last-expedition.txt");
    }

    private String readLastExpedition() {
        Path path = lastExpeditionPath();
        if (!Files.isRegularFile(path)) {
            return null;
        }
        try {
            String value = Files.readString(path, StandardCharsets.UTF_8).trim();
            return value.isBlank() ? null : value;
        } catch (IOException e) {
            return null;
        }
    }

    private void writeLastExpedition(String expeditionId) {
        try {
            Path path = lastExpeditionPath();
            Files.createDirectories(path.getParent());
            Files.writeString(path, expeditionId + "\n", StandardCharsets.UTF_8);
        } catch (IOException e) {
            getLogger().warning("Could not save the expedition id: " + e.getMessage());
        }
    }
}
