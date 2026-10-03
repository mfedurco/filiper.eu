package sk.vyprava.reward;

import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import sk.vyprava.lang.Speaker;
import sk.vyprava.model.RewardItem;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public final class RewardService {
    private final Speaker speaker;

    public RewardService(Speaker speaker) {
        this.speaker = speaker;
    }

    public void give(Player player, List<RewardItem> rewards) {
        if (player == null || rewards == null || rewards.isEmpty()) {
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
        if (text.isBlank()) {
            return;
        }
        speaker.tell(player, "reward-given", Map.of("reward", text));
    }
}
