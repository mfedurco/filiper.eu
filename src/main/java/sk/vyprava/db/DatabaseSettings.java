package sk.vyprava.db;

import org.bukkit.configuration.file.FileConfiguration;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

public final class DatabaseSettings {
    private final boolean enabled;
    private final String jdbcUrl;
    private final String serverId;

    private DatabaseSettings(boolean enabled, String jdbcUrl, String serverId) {
        this.enabled = enabled;
        this.jdbcUrl = jdbcUrl;
        this.serverId = serverId;
    }

    public static DatabaseSettings from(FileConfiguration config, Path dataFolder) {
        boolean enabled = config.getBoolean("database.enabled", false);
        String configured = blankToNull(config.getString("database.jdbc-url", ""));
        String url = configured != null ? configured : readUnpooledUrl(dataFolder);
        String serverId = blankToNull(config.getString("server-id", ""));
        return new DatabaseSettings(enabled, url, serverId);
    }

    public boolean enabled() {
        return enabled;
    }

    public String jdbcUrl() {
        return jdbcUrl;
    }

    public String serverId() {
        return serverId;
    }

    public static String readUnpooledUrl(Path dataFolder) {
        String fromEnv = blankToNull(System.getenv("DATABASE_URL_UNPOOLED"));
        if (fromEnv != null) {
            return fromEnv;
        }
        Path cwd = Path.of(System.getProperty("user.dir", "."));
        List<Path> candidates = List.of(
                dataFolder.resolve(".env.local"),
                dataFolder.resolve("../.env.local").normalize(),
                cwd.resolve(".env.local"),
                cwd.resolve("../.env.local").normalize(),
                cwd.resolve("../../.env.local").normalize()
        );
        for (Path candidate : candidates) {
            String value = readKey(candidate, "DATABASE_URL_UNPOOLED");
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    public static String readKey(Path file, String key) {
        if (!Files.isRegularFile(file)) {
            return null;
        }
        try {
            for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#") || !trimmed.startsWith(key + "=")) {
                    continue;
                }
                String value = trimmed.substring(key.length() + 1).trim();
                if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
                    value = value.substring(1, value.length() - 1);
                }
                return blankToNull(value);
            }
        } catch (IOException ignored) {
            return null;
        }
        return null;
    }

    private static String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
