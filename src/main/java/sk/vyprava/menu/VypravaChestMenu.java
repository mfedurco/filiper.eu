package sk.vyprava.menu;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.inventory.meta.SkullMeta;
import org.bukkit.persistence.PersistentDataType;
import sk.vyprava.VypravaPlugin;
import sk.vyprava.db.ExpeditionRecord;
import sk.vyprava.model.PartyData;
import sk.vyprava.model.PlayerProgress;
import sk.vyprava.model.QuestDefinition;
import sk.vyprava.model.QuestScope;
import sk.vyprava.model.SharedGoalData;
import sk.vyprava.quest.QuestService;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Double chest titled Truhla. The player's own inventory stays in the bottom half.
 */
public final class VypravaChestMenu implements Listener {
    private static final int SIZE = 54;
    private static final int QUEST_START = 18;
    private static final int QUEST_SLOTS = 9;
    private static final int BOARD_START = 36;
    private static final int BOARD_SLOTS = 9;

    private final VypravaPlugin plugin;
    private final NamespacedKey questKey;

    public VypravaChestMenu(VypravaPlugin plugin) {
        this.plugin = plugin;
        this.questKey = new NamespacedKey(plugin, "chest-quest");
    }

    public void open(Player player) {
        Holder holder = new Holder();
        Inventory inventory = Bukkit.createInventory(holder, SIZE, Component.text(plugin.plain(player, "chest-title")));
        holder.bind(inventory);
        fill(inventory, player);
        player.openInventory(inventory);
    }

    private void fill(Inventory inventory, Player player) {
        ItemStack gray = pane(Material.GRAY_STAINED_GLASS_PANE);
        ItemStack lime = pane(Material.LIME_STAINED_GLASS_PANE);
        for (int slot = 0; slot < SIZE; slot++) {
            inventory.setItem(slot, gray);
        }
        inventory.setItem(0, lime);

        QuestService quests = plugin.quests();
        PlayerProgress progress = quests.progress(player);
        inventory.setItem(1, expeditionBook(player, plugin.activeExpedition(), progress));

        List<QuestDefinition> lines = questLines(quests, progress, player);
        for (int i = 0; i < QUEST_SLOTS; i++) {
            int slot = QUEST_START + i;
            if (i < lines.size()) {
                inventory.setItem(slot, questItem(player, lines.get(i), currentOf(quests, progress, player, lines.get(i))));
            }
        }

        List<PlayerProgress> top = quests.leaderboard().topTotal(5);
        if (top.isEmpty()) {
            inventory.setItem(BOARD_START, labeled(
                    Material.PAPER,
                    plugin.plain(player, "chest-empty-board"),
                    NamedTextColor.GRAY,
                    List.of(line(plugin.plain(player, "chest-empty-board-lore"), NamedTextColor.DARK_GRAY))
            ));
        } else {
            int shown = 0;
            for (PlayerProgress entry : top) {
                if (shown >= BOARD_SLOTS) {
                    break;
                }
                inventory.setItem(BOARD_START + shown, head(player, entry, shown + 1));
                shown++;
            }
        }
    }

    private ItemStack expeditionBook(Player player, ExpeditionRecord expedition, PlayerProgress progress) {
        String title = expedition == null || expedition.title() == null || expedition.title().isBlank()
                ? plugin.plain(player, "chest-no-expedition")
                : expedition.title();
        List<Component> lore = new ArrayList<>();
        String about = expedition == null ? plugin.plain(player, "chest-not-tracking") : shorten(expedition.description());
        if (!about.isBlank()) {
            lore.add(line(about, NamedTextColor.GRAY));
        }
        lore.add(line(plugin.plain(player, "chest-points", Map.of("points", Integer.toString(progress.totalPoints()))), NamedTextColor.AQUA));
        return labeled(Material.BOOK, title, NamedTextColor.GOLD, lore);
    }

    private List<QuestDefinition> questLines(QuestService quests, PlayerProgress progress, Player player) {
        List<QuestDefinition> lines = new ArrayList<>();
        quests.registry().chapterByOrder(progress.currentChapterOrder()).ifPresent(chapter -> {
            for (QuestDefinition quest : chapter.quests()) {
                if (!progress.completedCampaign().contains(quest.id())) {
                    lines.add(quest);
                    return;
                }
            }
            if (!chapter.quests().isEmpty()) {
                lines.add(chapter.quests().get(0));
            }
        });
        addAssigned(lines, progress.assignedDaily(), progress.completedDaily(), quests, 2);
        addAssigned(lines, progress.assignedWeekly(), progress.completedWeekly(), quests, 1);
        addAssigned(lines, progress.assignedLongTerm(), progress.completedLongTerm(), quests, 1);
        for (SharedGoalData goal : quests.activeSharedGoals()) {
            if (lines.size() >= 5 || goal.completed()) {
                break;
            }
            quests.registry().sharedQuest(goal.questId()).ifPresent(lines::add);
        }
        if (lines.size() < 5) {
            quests.parties().findFor(player.getUniqueId()).ifPresent(party -> {
                if (party.activeQuestId() != null && !party.questCompleted()) {
                    quests.registry().partyQuest(party.activeQuestId()).ifPresent(quest -> {
                        if (lines.size() < 5) {
                            lines.add(quest);
                        }
                    });
                }
            });
        }
        return lines;
    }

    private static void addAssigned(
            List<QuestDefinition> lines,
            java.util.Set<String> assigned,
            java.util.Set<String> completed,
            QuestService quests,
            int limit
    ) {
        int added = 0;
        for (String id : assigned) {
            if (added >= limit || lines.size() >= 5) {
                return;
            }
            if (completed.contains(id)) {
                continue;
            }
            Optional<QuestDefinition> quest = quests.registry().find(id);
            if (quest.isPresent()) {
                lines.add(quest.get());
                added++;
            }
        }
    }

    private ItemStack questItem(Player player, QuestDefinition quest, int current) {
        ItemStack item = new ItemStack(icon(quest));
        ItemMeta meta = item.getItemMeta();
        meta.displayName(name(quest.name(), NamedTextColor.WHITE));
        String progress = current >= quest.amount()
                ? plugin.plain(player, "chest-done")
                : plugin.plain(player, "chest-progress", Map.of(
                        "current", Integer.toString(Math.min(current, quest.amount())),
                        "amount", Integer.toString(quest.amount())
                ));
        meta.lore(List.of(
                line(progress, NamedTextColor.YELLOW),
                line(plugin.plain(player, "chest-click"), NamedTextColor.DARK_GRAY)
        ));
        meta.addItemFlags(ItemFlag.HIDE_ATTRIBUTES, ItemFlag.HIDE_ADDITIONAL_TOOLTIP);
        meta.getPersistentDataContainer().set(questKey, PersistentDataType.STRING, quest.id());
        item.setItemMeta(meta);
        return item;
    }

    private ItemStack head(Player viewer, PlayerProgress entry, int place) {
        ItemStack item = new ItemStack(Material.PLAYER_HEAD);
        SkullMeta meta = (SkullMeta) item.getItemMeta();
        OfflinePlayer offline = Bukkit.getOfflinePlayer(entry.uuid());
        meta.setOwningPlayer(offline);
        NamedTextColor color = switch (place) {
            case 1 -> NamedTextColor.GOLD;
            case 2 -> NamedTextColor.GRAY;
            case 3 -> NamedTextColor.RED;
            default -> NamedTextColor.WHITE;
        };
        meta.displayName(name("#" + place + " " + entry.name(), color));
        meta.lore(List.of(line(
                plugin.plain(viewer, "chest-points-short", Map.of("points", Integer.toString(entry.totalPoints()))),
                NamedTextColor.AQUA
        )));
        item.setItemMeta(meta);
        return item;
    }

    private void showDetail(Player player, String questId) {
        QuestService quests = plugin.quests();
        QuestDefinition quest = quests.registry().find(questId).orElse(null);
        if (quest == null) {
            return;
        }
        PlayerProgress progress = quests.progress(player);
        int current = currentOf(quests, progress, player, quest);
        plugin.tellRaw(player, plugin.prefixFor(player) + "<yellow>" + net.kyori.adventure.text.minimessage.MiniMessage.miniMessage().escapeTags(quest.name()) + "</yellow>");
        if (quest.description() != null && !quest.description().isBlank()) {
            plugin.tellRaw(player, plugin.miniText(player, "gray-line", Map.of("text", quest.description())));
        }
        plugin.tell(player, "chest-detail-progress", Map.of(
                "current", Integer.toString(Math.min(current, quest.amount())),
                "amount", Integer.toString(quest.amount()),
                "points", Integer.toString(quest.points())
        ));
    }

    private int currentOf(QuestService quests, PlayerProgress progress, Player player, QuestDefinition quest) {
        String id = quest.id();
        return switch (quest.scope()) {
            case CAMPAIGN -> progress.campaignProgress().getOrDefault(id, 0);
            case DAILY -> progress.dailyProgress().getOrDefault(id, 0);
            case WEEKLY -> progress.weeklyProgress().getOrDefault(id, 0);
            case LONG_TERM -> progress.longTermProgress().getOrDefault(id, 0);
            case SHARED -> quests.activeSharedGoals().stream()
                    .filter(goal -> id.equals(goal.questId()))
                    .map(SharedGoalData::progress)
                    .findFirst()
                    .orElse(0);
            case PARTY -> quests.parties().findFor(player.getUniqueId())
                    .filter(party -> id.equals(party.activeQuestId()))
                    .map(PartyData::questProgress)
                    .orElse(0);
        };
    }

    private static Material icon(QuestDefinition quest) {
        return switch (quest.scope()) {
            case CAMPAIGN -> Material.OAK_LOG;
            case DAILY -> Material.BREAD;
            case WEEKLY -> Material.IRON_PICKAXE;
            case LONG_TERM -> Material.COMPASS;
            case SHARED -> Material.EMERALD;
            case PARTY -> Material.CAKE;
        };
    }

    private static ItemStack pane(Material material) {
        ItemStack item = new ItemStack(material);
        ItemMeta meta = item.getItemMeta();
        meta.displayName(Component.text(" ").decoration(TextDecoration.ITALIC, false));
        meta.setHideTooltip(true);
        item.setItemMeta(meta);
        return item;
    }

    private static ItemStack labeled(Material material, String title, NamedTextColor color, List<Component> lore) {
        ItemStack item = new ItemStack(material);
        ItemMeta meta = item.getItemMeta();
        meta.displayName(name(title, color));
        meta.lore(lore);
        item.setItemMeta(meta);
        return item;
    }

    private static Component name(String text, NamedTextColor color) {
        return Component.text(text).color(color).decoration(TextDecoration.ITALIC, false);
    }

    private static Component line(String text, NamedTextColor color) {
        return Component.text(text).color(color).decoration(TextDecoration.ITALIC, false);
    }

    private static String shorten(String text) {
        if (text == null || text.isBlank()) {
            return "";
        }
        String trimmed = text.trim().replace('\n', ' ');
        if (trimmed.length() <= 80) {
            return trimmed;
        }
        return trimmed.substring(0, 77) + "…";
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof Holder)) {
            return;
        }
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) {
            return;
        }
        if (event.getClickedInventory() == null || event.getClickedInventory() != event.getView().getTopInventory()) {
            return;
        }
        ItemStack item = event.getCurrentItem();
        if (item == null || !item.hasItemMeta()) {
            return;
        }
        String questId = item.getItemMeta().getPersistentDataContainer().get(questKey, PersistentDataType.STRING);
        if (questId != null) {
            showDetail(player, questId);
        }
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getView().getTopInventory().getHolder() instanceof Holder) {
            event.setCancelled(true);
        }
    }

    public static final class Holder implements InventoryHolder {
        private Inventory inventory;

        void bind(Inventory inventory) {
            this.inventory = inventory;
        }

        @Override
        public Inventory getInventory() {
            return inventory;
        }
    }
}
