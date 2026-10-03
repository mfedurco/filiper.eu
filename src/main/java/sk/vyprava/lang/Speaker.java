package sk.vyprava.lang;

import org.bukkit.entity.Player;

import java.util.Map;

public interface Speaker {
    void tell(Player player, String key, Map<String, String> vars);
}
