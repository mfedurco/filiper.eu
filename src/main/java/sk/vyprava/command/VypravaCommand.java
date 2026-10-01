package sk.vyprava.command;

import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import sk.vyprava.VypravaPlugin;
import sk.vyprava.model.ChapterDefinition;
import sk.vyprava.model.PartyData;
import sk.vyprava.model.PlayerProgress;
import sk.vyprava.model.QuestDefinition;
import sk.vyprava.model.QuestScope;
import sk.vyprava.model.SharedGoalData;
import sk.vyprava.quest.QuestService;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public final class VypravaCommand implements CommandExecutor, TabCompleter {
    private final VypravaPlugin plugin;
    private final MiniMessage mini = MiniMessage.miniMessage();

    public VypravaCommand(VypravaPlugin plugin) {
        this.plugin = plugin;
    }

    private QuestService quests() {
        return plugin.quests();
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            sendHelp(sender);
            return true;
        }
        String sub = args[0].toLowerCase(Locale.ROOT);
        return switch (sub) {
            case "help" -> {
                sendHelp(sender);
                yield true;
            }
            case "kampan", "campaign" -> {
                if (!(sender instanceof Player player)) {
                    sender.sendMessage("Len pre hráčov.");
                    yield true;
                }
                showCampaign(player);
                yield true;
            }
            case "denne", "daily" -> {
                if (!(sender instanceof Player player)) {
                    sender.sendMessage("Len pre hráčov.");
                    yield true;
                }
                showDaily(player);
                yield true;
            }
            case "tyzdenne", "weekly" -> {
                if (!(sender instanceof Player player)) {
                    sender.sendMessage("Len pre hráčov.");
                    yield true;
                }
                showWeekly(player);
                yield true;
            }
            case "dlhodobe", "longterm", "sezona" -> {
                if (!(sender instanceof Player player)) {
                    sender.sendMessage("Len pre hráčov.");
                    yield true;
                }
                showLongTerm(player);
                yield true;
            }
            case "spolocne", "shared" -> {
                showShared(sender);
                yield true;
            }
            case "questy", "quests" -> {
                if (!(sender instanceof Player player)) {
                    sender.sendMessage("Len pre hráčov.");
                    yield true;
                }
                showCampaign(player);
                showDaily(player);
                showWeekly(player);
                showLongTerm(player);
                showShared(player);
                yield true;
            }
            case "top", "rebricek" -> {
                showTop(sender);
                yield true;
            }
            case "party" -> handleParty(sender, args);
            case "reload" -> {
                if (!sender.hasPermission("vyprava.admin")) {
                    sender.sendMessage("Nemáš oprávnenie.");
                    yield true;
                }
                plugin.reloadFromDatabase(sender);
                yield true;
            }
            default -> {
                sendHelp(sender);
                yield true;
            }
        };
    }

    private boolean handleParty(CommandSender sender, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Len pre hráčov.");
            return true;
        }
        if (args.length < 2) {
            showParty(player);
            return true;
        }
        String action = args[1].toLowerCase(Locale.ROOT);
        switch (action) {
            case "create" -> {
                if (args.length < 3) {
                    player.sendMessage("Použitie: /vyprava party create <názov>");
                    return true;
                }
                String name = String.join(" ", Arrays.copyOfRange(args, 2, args.length));
                PartyData party = quests().parties().create(player, name);
                quests().assignPartyQuest(party, quests().progress(player));
                player.sendMessage(mini.deserialize(plugin.prefix() + "<green>Partia <white>" + name + "</white> vytvorená.</green>"));
            }
            case "invite" -> {
                if (args.length < 3) {
                    player.sendMessage("Použitie: /vyprava party invite <hráč>");
                    return true;
                }
                Player target = Bukkit.getPlayerExact(args[2]);
                if (target == null) {
                    player.sendMessage("Hráč nie je online.");
                    return true;
                }
                if (quests().parties().invite(player, target)) {
                    player.sendMessage("Pozvaný: " + target.getName());
                    target.sendMessage("Pridal si sa do partie hráča " + player.getName());
                    quests().parties().findFor(player.getUniqueId()).ifPresent(p ->
                            quests().assignPartyQuest(p, quests().progress(player)));
                } else {
                    player.sendMessage("Pozvanie zlyhalo (nie si líder / plná partia).");
                }
            }
            case "leave" -> {
                quests().parties().leave(player);
                player.sendMessage("Opustil si partiu.");
            }
            case "quest", "uloha" -> showParty(player);
            default -> player.sendMessage("party create|invite|leave|quest");
        }
        return true;
    }

    private void showCampaign(Player player) {
        PlayerProgress p = quests().progress(player);
        Optional<ChapterDefinition> chapterOpt = quests().registry().chapterByOrder(p.currentChapterOrder());
        if (chapterOpt.isEmpty()) {
            player.sendMessage("Kampaň je dokončená!");
            return;
        }
        ChapterDefinition chapter = chapterOpt.get();
        player.sendMessage(mini.deserialize(plugin.prefix() + "<gold><bold>Kapitola " + chapter.order()
                + ": " + chapter.name() + "</bold></gold>"));
        player.sendMessage(mini.deserialize("<gray>" + chapter.description() + "</gray>"));
        for (QuestDefinition quest : chapter.quests()) {
            int prog = p.getProgress(QuestScope.CAMPAIGN, quest.id());
            boolean done = p.isCompleted(QuestScope.CAMPAIGN, quest.id());
            String status = done ? "<green>✓</green>" : "<yellow>" + prog + "/" + quest.amount() + "</yellow>";
            player.sendMessage(mini.deserialize(status + " <white>" + quest.name() + "</white> <dark_gray>—</dark_gray> <gray>"
                    + quest.description() + "</gray>"));
        }
        boolean chapterDone = p.completedChapters().contains(chapter.id());
        player.sendMessage(mini.deserialize(chapterDone
                ? "<green>Milník: " + chapter.milestoneName() + " (splnený)</green>"
                : "<aqua>Milník: " + chapter.milestoneName() + "</aqua>"));
    }

    private void showDaily(Player player) {
        PlayerProgress p = quests().progress(player);
        player.sendMessage(mini.deserialize(plugin.prefix() + "<yellow><bold>Denné úlohy</bold></yellow> <gray>(" + p.dailyDate() + ")</gray>"));
        if (p.assignedDaily().isEmpty()) {
            player.sendMessage("Zatiaľ žiadne denné úlohy.");
            return;
        }
        for (String id : p.assignedDaily()) {
            quests().registry().dailyQuest(id).ifPresent(quest -> {
                int prog = p.getProgress(QuestScope.DAILY, quest.id());
                boolean done = p.isCompleted(QuestScope.DAILY, quest.id());
                String status = done ? "<green>✓</green>" : "<yellow>" + prog + "/" + quest.amount() + "</yellow>";
                player.sendMessage(mini.deserialize(status + " <white>" + quest.name() + "</white> <dark_gray>—</dark_gray> <gray>"
                        + quest.description() + "</gray>"));
            });
        }
    }

    private void showWeekly(Player player) {
        PlayerProgress p = quests().progress(player);
        player.sendMessage(mini.deserialize(plugin.prefix() + "<aqua><bold>Týždenné úlohy</bold></aqua> <gray>(" + p.weeklyKey() + ")</gray>"));
        if (p.assignedWeekly().isEmpty()) {
            player.sendMessage("Zatiaľ žiadne týždenné úlohy.");
            return;
        }
        for (String id : p.assignedWeekly()) {
            quests().registry().weeklyQuest(id).ifPresent(quest -> {
                int prog = p.getProgress(QuestScope.WEEKLY, quest.id());
                boolean done = p.isCompleted(QuestScope.WEEKLY, quest.id());
                String status = done ? "<green>✓</green>" : "<yellow>" + prog + "/" + quest.amount() + "</yellow>";
                player.sendMessage(mini.deserialize(status + " <white>" + quest.name() + "</white> <dark_gray>—</dark_gray> <gray>"
                        + quest.description() + "</gray>"));
            });
        }
    }

    private void showLongTerm(Player player) {
        PlayerProgress p = quests().progress(player);
        player.sendMessage(mini.deserialize(plugin.prefix() + "<gold><bold>Dlhodobé ciele</bold></gold> <gray>(" + p.longTermSeason() + ")</gray>"));
        if (p.assignedLongTerm().isEmpty()) {
            player.sendMessage("Zatiaľ žiadne dlhodobé ciele.");
            return;
        }
        for (String id : p.assignedLongTerm()) {
            quests().registry().longTermQuest(id).ifPresent(quest -> {
                int prog = p.getProgress(QuestScope.LONG_TERM, quest.id());
                boolean done = p.isCompleted(QuestScope.LONG_TERM, quest.id());
                String status = done ? "<green>✓</green>" : "<yellow>" + prog + "/" + quest.amount() + "</yellow>";
                player.sendMessage(mini.deserialize(status + " <white>" + quest.name() + "</white> <dark_gray>—</dark_gray> <gray>"
                        + quest.description() + "</gray>"));
            });
        }
    }

    private void showShared(CommandSender sender) {
        sender.sendMessage(mini.deserialize(plugin.prefix() + "<green><bold>Spoločné ciele</bold></green>"));
        List<SharedGoalData> goals = quests().activeSharedGoals();
        if (goals.isEmpty()) {
            sender.sendMessage("Momentálne nie sú aktívne spoločné ciele.");
            return;
        }
        for (SharedGoalData goal : goals) {
            quests().registry().sharedQuest(goal.questId()).ifPresent(quest -> {
                String status = goal.completed()
                        ? "<green>✓</green>"
                        : "<yellow>" + goal.progress() + "/" + quest.amount() + "</yellow>";
                sender.sendMessage(mini.deserialize(status + " <white>" + quest.name() + "</white>"));
                sender.sendMessage(mini.deserialize("<gray>" + quest.description() + "</gray>"));
                List<Map.Entry<UUID, Integer>> top = goal.contributions().entrySet().stream()
                        .sorted(Map.Entry.<UUID, Integer>comparingByValue().reversed())
                        .limit(5)
                        .toList();
                if (top.isEmpty()) {
                    sender.sendMessage(mini.deserialize("<dark_gray>Zatiaľ bez príspevkov.</dark_gray>"));
                } else {
                    for (Map.Entry<UUID, Integer> entry : top) {
                        String name = quests().store().find(entry.getKey())
                                .map(PlayerProgress::name)
                                .orElse(entry.getKey().toString().substring(0, 8));
                        sender.sendMessage(mini.deserialize("<dark_gray>•</dark_gray> <white>" + name
                                + "</white> <gray>+" + entry.getValue() + "</gray>"));
                    }
                }
            });
        }
    }

    private void showParty(Player player) {
        Optional<PartyData> opt = quests().parties().findFor(player.getUniqueId());
        if (opt.isEmpty()) {
            player.sendMessage("Nie si v partii. /vyprava party create <názov>");
            return;
        }
        PartyData party = opt.get();
        player.sendMessage(mini.deserialize(plugin.prefix() + "<light_purple><bold>Partia " + party.name() + "</bold></light_purple>"));
        player.sendMessage("Členovia: " + party.members().size());
        if (party.activeQuestId() == null) {
            quests().assignPartyQuest(party, quests().progress(player));
        }
        if (party.activeQuestId() != null) {
            quests().registry().partyQuest(party.activeQuestId()).ifPresent(quest -> {
                String status = party.questCompleted()
                        ? "hotovo"
                        : party.questProgress() + "/" + quest.amount();
                player.sendMessage(mini.deserialize("<white>" + quest.name() + "</white>: <yellow>" + status + "</yellow>"));
                player.sendMessage(mini.deserialize("<gray>" + quest.description() + "</gray>"));
                party.contribution().entrySet().stream()
                        .sorted(Map.Entry.<UUID, Integer>comparingByValue().reversed())
                        .limit(5)
                        .forEach(entry -> {
                            String name = quests().store().find(entry.getKey())
                                    .map(PlayerProgress::name)
                                    .orElse("?");
                            player.sendMessage(mini.deserialize("<dark_gray>•</dark_gray> <white>" + name
                                    + "</white> <gray>+" + entry.getValue() + "</gray>"));
                        });
            });
        }
    }

    private void showTop(CommandSender sender) {
        sender.sendMessage(mini.deserialize(plugin.prefix() + "<gold><bold>Rebríček</bold></gold>"));
        List<PlayerProgress> top = quests().leaderboard().topTotal(10);
        int i = 1;
        for (PlayerProgress p : top) {
            sender.sendMessage(mini.deserialize("<yellow>#" + i++ + "</yellow> <white>" + p.name()
                    + "</white> <gray>—</gray> <aqua>" + p.totalPoints() + " bodov</aqua> <dark_gray>(kap. "
                    + p.currentChapterOrder() + ")</dark_gray>"));
        }
        if (top.isEmpty()) {
            sender.sendMessage("Zatiaľ nikto nemá body.");
        }
    }

    private void sendHelp(CommandSender sender) {
        sender.sendMessage(mini.deserialize(plugin.prefix() + "<white>/vyprava kampan</white> <gray>— postup kampane</gray>"));
        sender.sendMessage("<white>/vyprava denne</white> <gray>— denné úlohy</gray>");
        sender.sendMessage("<white>/vyprava tyzdenne</white> <gray>— týždenné úlohy</gray>");
        sender.sendMessage("<white>/vyprava dlhodobe</white> <gray>— dlhodobé / sezónne ciele</gray>");
        sender.sendMessage("<white>/vyprava spolocne</white> <gray>— spoločné ciele servera</gray>");
        sender.sendMessage("<white>/vyprava party create|invite|leave</white> <gray>— partia</gray>");
        sender.sendMessage("<white>/vyprava top</white> <gray>— rebríček</gray>");
        if (sender.hasPermission("vyprava.admin")) {
            sender.sendMessage("<white>/vyprava reload</white> <gray>— admin reload</gray>");
        }
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            return filter(List.of(
                    "kampan", "denne", "tyzdenne", "dlhodobe", "spolocne",
                    "questy", "party", "top", "help", "reload"
            ), args[0]);
        }
        if (args.length == 2 && args[0].equalsIgnoreCase("party")) {
            return filter(List.of("create", "invite", "leave", "quest"), args[1]);
        }
        if (args.length == 3 && args[0].equalsIgnoreCase("party") && args[1].equalsIgnoreCase("invite")) {
            List<String> names = new ArrayList<>();
            for (Player p : Bukkit.getOnlinePlayers()) {
                names.add(p.getName());
            }
            return filter(names, args[2]);
        }
        return List.of();
    }

    private List<String> filter(List<String> options, String token) {
        String lower = token.toLowerCase(Locale.ROOT);
        return options.stream().filter(o -> o.toLowerCase(Locale.ROOT).startsWith(lower)).toList();
    }
}
