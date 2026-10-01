package sk.vyprava.model;

import org.bukkit.Material;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class RewardItem {
    private final Material material;
    private final int amount;

    public RewardItem(Material material, int amount) {
        this.material = material;
        this.amount = Math.max(0, amount);
    }

    public Material material() {
        return material;
    }

    public int amount() {
        return amount;
    }

    public boolean isValid() {
        return material != null && amount > 0;
    }

    public String display() {
        return amount + "x " + material.name().toLowerCase().replace('_', ' ');
    }

    public static List<RewardItem> parseList(List<?> raw) {
        if (raw == null || raw.isEmpty()) {
            return List.of();
        }
        List<RewardItem> out = new ArrayList<>();
        for (Object entry : raw) {
            if (!(entry instanceof java.util.Map<?, ?> map)) {
                continue;
            }
            Object matObj = map.get("material");
            Object amtObj = map.get("amount");
            if (matObj == null) {
                continue;
            }
            Material material = Material.matchMaterial(String.valueOf(matObj));
            int amount = amtObj instanceof Number number ? number.intValue() : 1;
            if (material != null && amount > 0) {
                out.add(new RewardItem(material, amount));
            }
        }
        return Collections.unmodifiableList(out);
    }
}
