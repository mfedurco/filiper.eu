package sk.vyprava;

import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;
import sk.vyprava.command.VypravaCommand;
import sk.vyprava.leaderboard.LeaderboardService;
import sk.vyprava.listener.QuestListener;
import sk.vyprava.party.PartyService;
import sk.vyprava.quest.QuestRegistry;
import sk.vyprava.quest.QuestService;
import sk.vyprava.reward.RewardService;
import sk.vyprava.storage.ProgressStore;
import sk.vyprava.web.WebApiServer;

import java.time.ZoneId;
import java.util.concurrent.TimeUnit;

public final class VypravaPlugin extends JavaPlugin {
    private ProgressStore store;
    private QuestRegistry registry;
    private QuestService quests;
    private WebApiServer webApi;
    private String prefix;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        reloadAll();
        getServer().getPluginManager().registerEvents(new QuestListener(quests), this);

        VypravaCommand command = new VypravaCommand(this, quests);
        PluginCommand cmd = getCommand("vyprava");
        if (cmd != null) {
            cmd.setExecutor(command);
            cmd.setTabCompleter(command);
        }

        getServer().getAsyncScheduler().runAtFixedRate(this, task -> store.save(), 5, 5, TimeUnit.MINUTES);
        getLogger().info("Výprava zapnutá — denné, týždenné, dlhodobé, spoločné ciele a web API.");
    }

    @Override
    public void onDisable() {
        if (webApi != null) {
            webApi.stop();
        }
        if (store != null) {
            store.save();
        }
    }

    public void reloadVyprava() {
        if (webApi != null) {
            webApi.stop();
            webApi = null;
        }
        reloadConfig();
        reloadAll();
    }

    private void reloadAll() {
        prefix = getConfig().getString("messages.prefix", "<gold><bold>Výprava</bold></gold> <dark_gray>»</dark_gray> ");
        ZoneId zone;
        try {
            zone = ZoneId.of(getConfig().getString("timezone", "Europe/Bratislava"));
        } catch (Exception e) {
            zone = ZoneId.systemDefault();
        }

        store = new ProgressStore(this);
        store.load();
        registry = new QuestRegistry(this);
        registry.load();
        PartyService parties = new PartyService(store);
        LeaderboardService leaderboard = new LeaderboardService(store);
        RewardService rewards = new RewardService(prefix);
        quests = new QuestService(
                registry,
                store,
                rewards,
                parties,
                leaderboard,
                prefix,
                zone,
                getConfig().getInt("daily-quest-count", 3),
                getConfig().getInt("weekly-quest-count", 2),
                getConfig().getInt("longterm-quest-count", 2),
                getConfig().getInt("shared-quest-count", 2),
                getConfig().getInt("party-quest-count", 1)
        );

        if (getConfig().getBoolean("web.enabled", true)) {
            int port = getConfig().getInt("web.port", 8765);
            String bind = getConfig().getString("web.bind", "0.0.0.0");
            try {
                webApi = new WebApiServer(quests, getConfig(), getLogger());
                webApi.start(port, bind);
            } catch (Exception e) {
                getLogger().severe("Web API sa nespustilo: " + e.getMessage());
            }
        }
    }

    public String prefix() {
        return prefix;
    }

    public QuestService quests() {
        return quests;
    }
}
