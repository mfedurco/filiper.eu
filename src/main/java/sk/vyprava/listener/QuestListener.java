package sk.vyprava.listener;

import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.event.inventory.CraftItemEvent;
import org.bukkit.event.inventory.FurnaceExtractEvent;
import org.bukkit.event.player.PlayerChangedWorldEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.inventory.ItemStack;
import sk.vyprava.VypravaPlugin;
import sk.vyprava.quest.QuestService;

public final class QuestListener implements Listener {
    private final VypravaPlugin plugin;

    public QuestListener(VypravaPlugin plugin) {
        this.plugin = plugin;
    }

    private QuestService quests() {
        return plugin.quests();
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        quests().handleJoin(event.getPlayer());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        quests().handleBreak(event.getPlayer(), event.getBlock().getType());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        quests().handlePlace(event.getPlayer(), event.getBlockPlaced().getType());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onKill(EntityDeathEvent event) {
        Player killer = event.getEntity().getKiller();
        if (killer != null) {
            quests().handleKill(killer, event.getEntityType());
        }
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onCraft(CraftItemEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) {
            return;
        }
        ItemStack result = event.getCurrentItem();
        if (result == null || result.getType().isAir()) {
            return;
        }
        int amount = result.getAmount();
        if (event.isShiftClick()) {
            amount = Math.max(1, amount);
        }
        quests().handleCraft(player, result.getType(), amount);
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onSmelt(FurnaceExtractEvent event) {
        Material material = event.getItemType();
        if (material != null && !material.isAir()) {
            quests().handleSmelt(event.getPlayer(), material, event.getItemAmount());
        }
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPickup(EntityPickupItemEvent event) {
        if (!(event.getEntity() instanceof Player player)) {
            return;
        }
        ItemStack stack = event.getItem().getItemStack();
        quests().handlePickup(player, stack.getType(), stack.getAmount());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onWorld(PlayerChangedWorldEvent event) {
        quests().handleWorld(event.getPlayer(), event.getPlayer().getWorld().getEnvironment());
    }
}
