package sk.vyprava.reward;

import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import sk.vyprava.model.RewardItem;

import java.util.List;
import java.util.stream.Collectors;

public final class RewardService {
    private final MiniMessage mini = MiniMessage.miniMessage();
    private final String prefix;
    private final String rewardGiven;

    public RewardService(String prefix, String rewardGiven) {
        this.prefix = prefix == null ? "" : prefix;
        this.rewardGiven = rewardGiven == null || rewardGiven.isBlank()
                ? "<aqua>Odmena:</aqua> <white>{reward}</white>"
                : rewardGiven;
    }

    public void give(Player player, List<RewardItem> rewards) {
        if (rewards == null || rewards.isEmpty()) {
            return;
        }
        for (RewardItem reward : rewards) {
            if (!reward.isValid()) {
                continue;
            }
            ItemStack stack = new ItemStack(reward.material(), reward.amount());
            var leftover = player.getInventory().addItem(stack);
            leftover.values().forEach(item -> player.getWorld().dropItemNaturally(player.getLocation(), item));
        }
        String text = rewards.stream().filter(RewardItem::isValid).map(RewardItem::display).collect(Collectors.joining(", "));
        player.sendMessage(mini.deserialize(prefix + rewardGiven.replace("{reward}", text)));
    }
}
