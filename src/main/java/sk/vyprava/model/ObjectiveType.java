package sk.vyprava.model;

import org.bukkit.Material;
import org.bukkit.entity.EntityType;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public enum ObjectiveType {
    BREAK_BLOCK,
    PLACE_BLOCK,
    KILL_ENTITY,
    CRAFT_ITEM,
    SMELT_ITEM,
    PICKUP_ITEM,
    ENTER_WORLD,
    JOIN;

    public static ObjectiveType from(String raw) {
        return ObjectiveType.valueOf(raw.trim().toUpperCase(Locale.ROOT));
    }

    public static ObjectiveType fromTracking(String raw) {
        return switch (raw) {
            case "break_block" -> BREAK_BLOCK;
            case "place_block" -> PLACE_BLOCK;
            case "pickup" -> PICKUP_ITEM;
            case "craft" -> CRAFT_ITEM;
            case "smelt" -> SMELT_ITEM;
            case "kill" -> KILL_ENTITY;
            case "join" -> JOIN;
            case "enter_world" -> ENTER_WORLD;
            default -> throw new IllegalArgumentException("Neznámy spôsob sledovania: " + raw);
        };
    }

    public boolean matchesMaterial(List<String> targets, Material material) {
        if (targets == null || targets.isEmpty()) {
            return false;
        }
        String name = material.name();
        for (String target : targets) {
            if ("ANY_SOLID".equalsIgnoreCase(target)) {
                return material.isBlock() && material.isSolid() && material.isItem();
            }
            if (name.equalsIgnoreCase(target)) {
                return true;
            }
        }
        return false;
    }

    public boolean matchesEntity(List<String> targets, EntityType type) {
        if (targets == null || targets.isEmpty()) {
            return false;
        }
        String name = type.name();
        for (String target : targets) {
            if (name.equalsIgnoreCase(target)) {
                return true;
            }
        }
        return false;
    }

    public boolean matchesWorld(List<String> targets, String environmentName) {
        if (targets == null || targets.isEmpty()) {
            return false;
        }
        for (String target : targets) {
            if (environmentName.equalsIgnoreCase(target)
                    || ("NETHER".equalsIgnoreCase(target) && "NETHER".equalsIgnoreCase(environmentName))
                    || ("THE_END".equalsIgnoreCase(target) && "THE_END".equalsIgnoreCase(environmentName))) {
                return true;
            }
        }
        return false;
    }
}
