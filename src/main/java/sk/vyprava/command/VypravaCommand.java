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

import org.bukkit.plugin.Plugin;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
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
        if (sender instanceof Player joined) {
            plugin.ensureLanguage(joined);
        }
        if (args.length == 0) {
            openChest(sender);
            return true;
        }
        String sub = args[0].toLowerCase(Locale.ROOT);
        return switch (sub) {
            case "truhla", "chest", "menu" -> {
                openChest(sender);
                yield true;
            }
            case "help" -> {
                sendHelp(sender);
                yield true;
            }
            case "kampan", "campaign" -> {
                if (!(sender instanceof Player player)) {
                    plugin.tell(sender, "players-only");
                    yield true;
                }
                showCampaign(player);
                yield true;
            }
            case "denne", "daily" -> {
                if (!(sender instanceof Player player)) {
                    plugin.tell(sender, "players-only");
                    yield true;
                }
                showDaily(player);
                yield true;
            }
            case "tyzdenne", "weekly" -> {
                if (!(sender instanceof Player player)) {
                    plugin.tell(sender, "players-only");
                    yield true;
                }
                showWeekly(player);
                yield true;
            }
            case "dlhodobe", "longterm", "sezona" -> {
                if (!(sender instanceof Player player)) {
                    plugin.tell(sender, "players-only");
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
                    plugin.tell(sender, "players-only");
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
            case "jazyk", "language" -> {
                setLanguage(sender, args);
                yield true;
            }
            case "prepojit", "link" -> {
                if (!(sender instanceof Player player)) {
                    plugin.tell(sender, "players-only");
                    yield true;
                }
                issueLink(player);
                yield true;
            }
            case "reload" -> {
                if (!sender.hasPermission("vyprava.admin")) {
                    plugin.tell(sender, "no-permission");
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
            plugin.tell(sender, "players-only");
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
                    plugin.tell(player, "party-create-usage");
                    return true;
                }
                String name = String.join(" ", Arrays.copyOfRange(args, 2, args.length));
                PartyData party = quests().parties().create(player, name);
                quests().assignPartyQuest(party, quests().progress(player));
                plugin.tell(player, "party-created", Map.of("name", name));
            }
            case "invite" -> {
                if (args.length < 3) {
                    plugin.tell(player, "party-invite-usage");
                    return true;
                }
                Player target = Bukkit.getPlayerExact(args[2]);
                if (target == null) {
                    plugin.tell(player, "player-offline");
                    return true;
                }
                if (quests().parties().invite(player, target)) {
                    plugin.tell(player, "party-invited", Map.of("name", target.getName()));
                    plugin.tell(target, "party-joined", Map.of("name", player.getName()));
                    quests().parties().findFor(player.getUniqueId()).ifPresent(p ->
                            quests().assignPartyQuest(p, quests().progress(player)));
                } else {
                    plugin.tell(player, "party-invite-failed");
                }
            }
            case "leave" -> {
                quests().parties().leave(player);
                plugin.tell(player, "party-left");
            }
            case "quest", "uloha" -> showParty(player);
            default -> plugin.tell(player, "party-usage");
        }
        return true;
    }

    private void openChest(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            plugin.tell(sender, "players-only");
            return;
        }
        new sk.vyprava.menu.VypravaChestMenu(plugin).open(player);
    }

    private void showCampaign(Player player) {
        PlayerProgress p = quests().progress(player);
        Optional<ChapterDefinition> chapterOpt = quests().registry().chapterByOrder(p.currentChapterOrder());
        if (chapterOpt.isEmpty()) {
            plugin.tell(player, "campaign-done");
            return;
        }
        ChapterDefinition chapter = chapterOpt.get();
        plugin.tell(player, "chapter-title", Map.of("order", Integer.toString(chapter.order()), "name", chapter.name()));
        plugin.tellRaw(player, plugin.miniText(player, "gray-line", Map.of("text", chapter.description())));
        for (QuestDefinition quest : chapter.quests()) {
            int prog = p.getProgress(QuestScope.CAMPAIGN, quest.id());
            boolean done = p.isCompleted(QuestScope.CAMPAIGN, quest.id());
            String status = done ? "<green>✓</green>" : "<yellow>" + prog + "/" + quest.amount() + "</yellow>";
            plugin.tellRaw(player, status + " " + plugin.miniText(player, "quest-line", Map.of("name", quest.name(), "text", quest.description())));
        }
        boolean chapterDone = p.completedChapters().contains(chapter.id());
        plugin.tell(player, chapterDone ? "milestone-done" : "milestone-open", Map.of("name", chapter.milestoneName()));
    }

    private void showDaily(Player player) {
        PlayerProgress p = quests().progress(player);
        plugin.tell(player, "daily-title", Map.of("date", p.dailyDate()));
        if (p.assignedDaily().isEmpty()) {
            plugin.tell(player, "daily-empty");
            return;
        }
        for (String id : p.assignedDaily()) {
            quests().registry().dailyQuest(id).ifPresent(quest -> {
                int prog = p.getProgress(QuestScope.DAILY, quest.id());
                boolean done = p.isCompleted(QuestScope.DAILY, quest.id());
                String status = done ? "<green>✓</green>" : "<yellow>" + prog + "/" + quest.amount() + "</yellow>";
                plugin.tellRaw(player, status + " " + plugin.miniText(player, "quest-line", Map.of("name", quest.name(), "text", quest.description())));
            });
        }
    }

    private void showWeekly(Player player) {
        PlayerProgress p = quests().progress(player);
        plugin.tell(player, "weekly-title", Map.of("week", p.weeklyKey()));
        if (p.assignedWeekly().isEmpty()) {
            plugin.tell(player, "weekly-empty");
            return;
        }
        for (String id : p.assignedWeekly()) {
            quests().registry().weeklyQuest(id).ifPresent(quest -> {
                int prog = p.getProgress(QuestScope.WEEKLY, quest.id());
                boolean done = p.isCompleted(QuestScope.WEEKLY, quest.id());
                String status = done ? "<green>✓</green>" : "<yellow>" + prog + "/" + quest.amount() + "</yellow>";
                plugin.tellRaw(player, status + " " + plugin.miniText(player, "quest-line", Map.of("name", quest.name(), "text", quest.description())));
            });
        }
    }

    private void showLongTerm(Player player) {
        PlayerProgress p = quests().progress(player);
        plugin.tell(player, "longterm-title", Map.of("season", p.longTermSeason()));
        if (p.assignedLongTerm().isEmpty()) {
            plugin.tell(player, "longterm-empty");
            return;
        }
        for (String id : p.assignedLongTerm()) {
            quests().registry().longTermQuest(id).ifPresent(quest -> {
                int prog = p.getProgress(QuestScope.LONG_TERM, quest.id());
                boolean done = p.isCompleted(QuestScope.LONG_TERM, quest.id());
                String status = done ? "<green>✓</green>" : "<yellow>" + prog + "/" + quest.amount() + "</yellow>";
                plugin.tellRaw(player, status + " " + plugin.miniText(player, "quest-line", Map.of("name", quest.name(), "text", quest.description())));
            });
        }
    }

    private void showShared(CommandSender sender) {
        plugin.tell(sender, "shared-title");
        List<SharedGoalData> goals = quests().activeSharedGoals();
        if (goals.isEmpty()) {
            plugin.tell(sender, "shared-empty");
            return;
        }
        for (SharedGoalData goal : goals) {
            quests().registry().sharedQuest(goal.questId()).ifPresent(quest -> {
                String status = goal.completed()
                        ? "<green>✓</green>"
                        : "<yellow>" + goal.progress() + "/" + quest.amount() + "</yellow>";
                plugin.tellRaw(sender, status + " " + plugin.miniText(sender, "shared-goal", Map.of("name", quest.name())));
                plugin.tellRaw(sender, plugin.miniText(sender, "gray-line", Map.of("text", quest.description())));
                List<Map.Entry<UUID, Integer>> top = goal.contributions().entrySet().stream()
                        .sorted(Map.Entry.<UUID, Integer>comparingByValue().reversed())
                        .limit(5)
                        .toList();
                if (top.isEmpty()) {
                    plugin.tell(sender, "no-contributions");
                } else {
                    for (Map.Entry<UUID, Integer> entry : top) {
                        String name = quests().store().find(entry.getKey())
                                .map(PlayerProgress::name)
                                .orElse(entry.getKey().toString().substring(0, 8));
                        plugin.tell(sender, "contribution", Map.of("name", name, "amount", Integer.toString(entry.getValue())));
                    }
                }
            });
        }
    }

    private void showParty(Player player) {
        Optional<PartyData> opt = quests().parties().findFor(player.getUniqueId());
        if (opt.isEmpty()) {
            plugin.tell(player, "party-none");
            return;
        }
        PartyData party = opt.get();
        plugin.tell(player, "party-title", Map.of("name", party.name()));
        plugin.tell(player, "party-members", Map.of("count", Integer.toString(party.members().size())));
        if (party.activeQuestId() == null) {
            quests().assignPartyQuest(party, quests().progress(player));
        }
        if (party.activeQuestId() != null) {
            quests().registry().partyQuest(party.activeQuestId()).ifPresent(quest -> {
                String status = party.questCompleted()
                        ? plugin.plain(player, "party-done-word")
                        : party.questProgress() + "/" + quest.amount();
                plugin.tell(player, "party-quest", Map.of("name", quest.name(), "status", status));
                plugin.tellRaw(player, plugin.miniText(player, "gray-line", Map.of("text", quest.description())));
                party.contribution().entrySet().stream()
                        .sorted(Map.Entry.<UUID, Integer>comparingByValue().reversed())
                        .limit(5)
                        .forEach(entry -> {
                            String name = quests().store().find(entry.getKey())
                                    .map(PlayerProgress::name)
                                    .orElse("?");
                            plugin.tell(player, "contribution", Map.of("name", name, "amount", Integer.toString(entry.getValue())));
                        });
            });
        }
    }

    private void showTop(CommandSender sender) {
        plugin.tell(sender, "top-title");
        List<PlayerProgress> top = quests().leaderboard().topTotal(10);
        int i = 1;
        for (PlayerProgress p : top) {
            plugin.tell(sender, "top-line", Map.of(
                    "place", Integer.toString(i++),
                    "name", p.name(),
                    "points", Integer.toString(p.totalPoints()),
                    "chapter", Integer.toString(p.currentChapterOrder())
            ));
        }
        if (top.isEmpty()) {
            plugin.tell(sender, "top-empty");
        }
    }

    private void sendHelp(CommandSender sender) {
        plugin.tell(sender, "help-chest");
        plugin.tellRaw(sender, plugin.miniText(sender, "help-chest-again", Map.of()));
        plugin.tellRaw(sender, plugin.miniText(sender, "help-campaign", Map.of()));
        plugin.tellRaw(sender, plugin.miniText(sender, "help-daily", Map.of()));
        plugin.tellRaw(sender, plugin.miniText(sender, "help-weekly", Map.of()));
        plugin.tellRaw(sender, plugin.miniText(sender, "help-longterm", Map.of()));
        plugin.tellRaw(sender, plugin.miniText(sender, "help-shared", Map.of()));
        plugin.tellRaw(sender, plugin.miniText(sender, "help-party", Map.of()));
        plugin.tellRaw(sender, plugin.miniText(sender, "help-top", Map.of()));
        plugin.tellRaw(sender, plugin.miniText(sender, "help-language", Map.of()));
        plugin.tellRaw(sender, plugin.miniText(sender, "help-link", Map.of()));
        if (sender.hasPermission("vyprava.admin")) {
            plugin.tellRaw(sender, plugin.miniText(sender, "help-reload", Map.of()));
        }
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            return filter(List.of(
                    "truhla", "kampan", "denne", "tyzdenne", "dlhodobe", "spolocne",
                    "questy", "party", "top", "jazyk", "prepojit", "help", "reload"
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
        if (args.length == 2 && (args[0].equalsIgnoreCase("jazyk") || args[0].equalsIgnoreCase("language"))) {
            return filter(List.of("sk", "en"), args[1]);
        }
        return List.of();
    }

    private void setLanguage(CommandSender sender, String[] args) {
        if (!(sender instanceof Player player)) {
            plugin.tell(sender, "players-only");
            return;
        }
        if (args.length < 2) {
            plugin.tell(player, "language-now", Map.of("language", plugin.languageLabel(player)));
            return;
        }
        String chosen = args[1].toLowerCase(Locale.ROOT);
        if (!chosen.equals("sk") && !chosen.equals("en")) {
            plugin.tell(player, "language-usage");
            return;
        }
        plugin.setLanguage(player, chosen);
        plugin.tell(player, "language-set", Map.of("language", plugin.languageLabel(player)));
    }

    private void issueLink(Player player) {
        plugin.ensureLanguage(player);
        String code = mintCode();
        plugin.tell(player, "link-sending");
        plugin.getServer().getAsyncScheduler().runNow((Plugin) plugin, task -> {
            boolean accepted = plugin.publishClaimCode(player.getUniqueId(), player.getName(), code);
            player.getScheduler().run((Plugin) plugin, scheduled -> {
                if (!player.isOnline()) {
                    return;
                }
                if (!accepted) {
                    plugin.tell(player, "link-failed");
                    return;
                }
                plugin.tell(player, "link-code", Map.of("code", code));
                plugin.tell(player, "link-hint");
            }, null);
        });
    }

    private static String mintCode() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        SecureRandom random = new SecureRandom();
        StringBuilder code = new StringBuilder(8);
        for (int i = 0; i < 8; i++) {
            code.append(alphabet.charAt(random.nextInt(alphabet.length())));
        }
        return code.toString();
    }

    private List<String> filter(List<String> options, String token) {
        String lower = token.toLowerCase(Locale.ROOT);
        return options.stream().filter(o -> o.toLowerCase(Locale.ROOT).startsWith(lower)).toList();
    }
}
