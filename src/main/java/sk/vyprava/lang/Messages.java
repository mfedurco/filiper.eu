package sk.vyprava.lang;

import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Player-facing strings. Config keys under messages.sk and messages.en win.
 * Missing keys fall back to the copy shipped with the plugin.
 */
public final class Messages {
    public static final String SK = "sk";
    public static final String EN = "en";

    private static final MiniMessage MINI = MiniMessage.miniMessage();
    private static final Map<String, Map<String, String>> DEFAULTS = defaults();

    private final String serverDefault;
    private final Map<String, Map<String, String>> packs;

    private Messages(String serverDefault, Map<String, Map<String, String>> packs) {
        this.serverDefault = serverDefault;
        this.packs = packs;
    }

    public static Messages load(FileConfiguration config) {
        String configured = config.getString("language.default", SK);
        String serverDefault = EN.equalsIgnoreCase(configured) ? EN : SK;
        Map<String, Map<String, String>> packs = new HashMap<>();
        for (String lang : new String[]{SK, EN}) {
            Map<String, String> pack = new HashMap<>(DEFAULTS.get(lang));
            ConfigurationSection section = config.getConfigurationSection("messages." + lang);
            if (section != null) {
                for (String key : section.getKeys(false)) {
                    String value = section.getString(key);
                    if (value != null && !value.isBlank()) {
                        pack.put(key, value);
                    }
                }
            }
            packs.put(lang, pack);
        }
        applyLegacy(config, packs.get(SK));
        return new Messages(serverDefault, packs);
    }

    public String serverDefault() {
        return serverDefault;
    }

    public String preferred(String saved) {
        String normalized = normalize(saved);
        return normalized == null ? serverDefault : normalized;
    }

    public String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        String value = raw.trim().toLowerCase(Locale.ROOT);
        if (value.equals(SK) || value.equals(EN)) {
            return value;
        }
        return null;
    }

    public String fromLocale(Locale locale) {
        if (locale != null) {
            String language = locale.getLanguage();
            if (language != null && language.toLowerCase(Locale.ROOT).startsWith(SK)) {
                return SK;
            }
            String tag = locale.toLanguageTag();
            if (tag != null && tag.toLowerCase(Locale.ROOT).startsWith(SK)) {
                return SK;
            }
        }
        return serverDefault;
    }

    public String prefixed(String lang, String key, Map<String, String> vars) {
        return prefix(lang) + format(lang, key, vars);
    }

    public String plain(String lang, String key, Map<String, String> vars) {
        return MINI.stripTags(format(lang, key, vars));
    }

    public String prefix(String lang) {
        return raw(lang, "prefix");
    }

    public String format(String lang, String key, Map<String, String> vars) {
        String template = raw(lang, key);
        if (vars == null || vars.isEmpty()) {
            return template;
        }
        for (Map.Entry<String, String> entry : vars.entrySet()) {
            String value = entry.getValue() == null ? "" : MINI.escapeTags(entry.getValue());
            template = template.replace("{" + entry.getKey() + "}", value);
        }
        return template;
    }

    private String raw(String lang, String key) {
        String chosen = normalize(lang);
        if (chosen == null) {
            chosen = serverDefault;
        }
        String value = packs.getOrDefault(chosen, Map.of()).get(key);
        if (value != null) {
            return value;
        }
        return DEFAULTS.getOrDefault(chosen, DEFAULTS.get(SK)).getOrDefault(key, key);
    }

    private static void applyLegacy(FileConfiguration config, Map<String, String> slovak) {
        String[] keys = {
                "prefix", "daily-reset", "weekly-reset", "longterm-reset",
                "shared-complete", "chapter-complete", "quest-complete", "reward-given"
        };
        for (String key : keys) {
            if (config.isConfigurationSection("messages." + key)) {
                continue;
            }
            String value = config.getString("messages." + key);
            if (value != null && !value.isBlank()) {
                slovak.put(key, value);
            }
        }
    }

    private static Map<String, Map<String, String>> defaults() {
        Map<String, String> sk = new HashMap<>();
        Map<String, String> en = new HashMap<>();
        put(sk, en, "prefix",
                "<gold><bold>Výprava</bold></gold> <dark_gray>»</dark_gray> ",
                "<gold><bold>Expedition</bold></gold> <dark_gray>»</dark_gray> ");
        put(sk, en, "players-only", "Len pre hráčov.", "Players only.");
        put(sk, en, "no-permission", "Nemáš oprávnenie.", "You do not have permission.");
        put(sk, en, "reload-loading", "Výprava sa načítava z databázy…", "Expedition is loading from the database…");
        put(sk, en, "reload-ok", "Výprava je znova načítaná.", "Expedition reloaded.");
        put(sk, en, "party-create-usage", "Použitie: /vyprava party create <názov>", "Usage: /vyprava party create <name>");
        put(sk, en, "party-created", "<green>Partia <white>{name}</white> je vytvorená.</green>", "<green>Party <white>{name}</white> has been created.</green>");
        put(sk, en, "party-invite-usage", "Použitie: /vyprava party invite <hráč>", "Usage: /vyprava party invite <player>");
        put(sk, en, "player-offline", "Hráč nie je online.", "That player is not online.");
        put(sk, en, "party-invited", "Pozvaný: {name}", "Invited: {name}");
        put(sk, en, "party-joined", "Pridal si sa do partie hráča {name}.", "You joined {name}'s party.");
        put(sk, en, "party-invite-failed", "Pozvanie zlyhalo (nie si líder alebo partia je plná).", "Invite failed (you are not the leader, or the party is full).");
        put(sk, en, "party-left", "Opustil si partiu.", "You left the party.");
        put(sk, en, "party-usage", "party create|invite|leave|quest", "party create|invite|leave|quest");
        put(sk, en, "party-new-leader", "Si nový líder partie {party}.", "You are the new leader of party {party}.");
        put(sk, en, "campaign-done", "Kampaň je dokončená!", "The campaign is complete!");
        put(sk, en, "chapter-title", "<gold><bold>Kapitola {order}: {name}</bold></gold>", "<gold><bold>Chapter {order}: {name}</bold></gold>");
        put(sk, en, "gray-line", "<gray>{text}</gray>", "<gray>{text}</gray>");
        put(sk, en, "quest-line", "<white>{name}</white> <dark_gray>—</dark_gray> <gray>{text}</gray>", "<white>{name}</white> <dark_gray>—</dark_gray> <gray>{text}</gray>");
        put(sk, en, "milestone-done", "<green>Milník: {name} (splnený)</green>", "<green>Milestone: {name} (done)</green>");
        put(sk, en, "milestone-open", "<aqua>Milník: {name}</aqua>", "<aqua>Milestone: {name}</aqua>");
        put(sk, en, "daily-title", "<yellow><bold>Denné úlohy</bold></yellow> <gray>({date})</gray>", "<yellow><bold>Daily quests</bold></yellow> <gray>({date})</gray>");
        put(sk, en, "daily-empty", "Zatiaľ žiadne denné úlohy.", "No daily quests yet.");
        put(sk, en, "weekly-title", "<aqua><bold>Týždenné úlohy</bold></aqua> <gray>({week})</gray>", "<aqua><bold>Weekly quests</bold></aqua> <gray>({week})</gray>");
        put(sk, en, "weekly-empty", "Zatiaľ žiadne týždenné úlohy.", "No weekly quests yet.");
        put(sk, en, "longterm-title", "<gold><bold>Dlhodobé ciele</bold></gold> <gray>({season})</gray>", "<gold><bold>Long-term goals</bold></gold> <gray>({season})</gray>");
        put(sk, en, "longterm-empty", "Zatiaľ žiadne dlhodobé ciele.", "No long-term goals yet.");
        put(sk, en, "shared-title", "<green><bold>Spoločné ciele</bold></green>", "<green><bold>Shared goals</bold></green>");
        put(sk, en, "shared-empty", "Momentálne nie sú aktívne spoločné ciele.", "There are no active shared goals right now.");
        put(sk, en, "shared-goal", "<white>{name}</white>", "<white>{name}</white>");
        put(sk, en, "no-contributions", "<dark_gray>Zatiaľ bez príspevkov.</dark_gray>", "<dark_gray>No contributions yet.</dark_gray>");
        put(sk, en, "contribution", "<dark_gray>•</dark_gray> <white>{name}</white> <gray>+{amount}</gray>", "<dark_gray>•</dark_gray> <white>{name}</white> <gray>+{amount}</gray>");
        put(sk, en, "party-none", "Nie si v partii. /vyprava party create <názov>", "You are not in a party. /vyprava party create <name>");
        put(sk, en, "party-title", "<light_purple><bold>Partia {name}</bold></light_purple>", "<light_purple><bold>Party {name}</bold></light_purple>");
        put(sk, en, "party-members", "Členovia: {count}", "Members: {count}");
        put(sk, en, "party-quest", "<white>{name}</white>: <yellow>{status}</yellow>", "<white>{name}</white>: <yellow>{status}</yellow>");
        put(sk, en, "party-done-word", "hotovo", "done");
        put(sk, en, "top-title", "<gold><bold>Rebríček</bold></gold>", "<gold><bold>Leaderboard</bold></gold>");
        put(sk, en, "top-line", "<yellow>#{place}</yellow> <white>{name}</white> <gray>—</gray> <aqua>{points} bodov</aqua> <dark_gray>(kap. {chapter})</dark_gray>", "<yellow>#{place}</yellow> <white>{name}</white> <gray>—</gray> <aqua>{points} points</aqua> <dark_gray>(ch. {chapter})</dark_gray>");
        put(sk, en, "top-empty", "Zatiaľ nikto nemá body.", "Nobody has points yet.");
        put(sk, en, "help-chest", "<white>/vyprava</white> <gray>— truhla s výpravou</gray>", "<white>/vyprava</white> <gray>— expedition chest</gray>");
        put(sk, en, "help-chest-again", "<white>/vyprava truhla</white> <gray>— tá istá truhla</gray>", "<white>/vyprava truhla</white> <gray>— the same chest</gray>");
        put(sk, en, "help-campaign", "<white>/vyprava kampan</white> <gray>— postup kampane</gray>", "<white>/vyprava kampan</white> <gray>— campaign progress</gray>");
        put(sk, en, "help-daily", "<white>/vyprava denne</white> <gray>— denné úlohy</gray>", "<white>/vyprava denne</white> <gray>— daily quests</gray>");
        put(sk, en, "help-weekly", "<white>/vyprava tyzdenne</white> <gray>— týždenné úlohy</gray>", "<white>/vyprava tyzdenne</white> <gray>— weekly quests</gray>");
        put(sk, en, "help-longterm", "<white>/vyprava dlhodobe</white> <gray>— dlhodobé ciele</gray>", "<white>/vyprava dlhodobe</white> <gray>— long-term goals</gray>");
        put(sk, en, "help-shared", "<white>/vyprava spolocne</white> <gray>— spoločné ciele servera</gray>", "<white>/vyprava spolocne</white> <gray>— shared server goals</gray>");
        put(sk, en, "help-party", "<white>/vyprava party create|invite|leave</white> <gray>— partia</gray>", "<white>/vyprava party create|invite|leave</white> <gray>— party</gray>");
        put(sk, en, "help-top", "<white>/vyprava top</white> <gray>— rebríček</gray>", "<white>/vyprava top</white> <gray>— leaderboard</gray>");
        put(sk, en, "help-language", "<white>/vyprava jazyk sk|en</white> <gray>— jazyk správ</gray>", "<white>/vyprava jazyk sk|en</white> <gray>— message language</gray>");
        put(sk, en, "help-link", "<white>/vyprava prepojit</white> <gray>— kód na prepojenie profilu</gray>", "<white>/vyprava prepojit</white> <gray>— code to link your profile</gray>");
        put(sk, en, "help-reload", "<white>/vyprava reload</white> <gray>— znova načítať</gray>", "<white>/vyprava reload</white> <gray>— reload</gray>");
        put(sk, en, "daily-reset", "<green>Nové denné úlohy! <yellow>/vyprava denne</yellow></green>", "<green>New daily quests! <yellow>/vyprava denne</yellow></green>");
        put(sk, en, "weekly-reset", "<aqua>Nové týždenné úlohy! <yellow>/vyprava tyzdenne</yellow></aqua>", "<aqua>New weekly quests! <yellow>/vyprava tyzdenne</yellow></aqua>");
        put(sk, en, "longterm-reset", "<gold>Nové dlhodobé ciele! <yellow>/vyprava dlhodobe</yellow></gold>", "<gold>New long-term goals! <yellow>/vyprava dlhodobe</yellow></gold>");
        put(sk, en, "quest-complete", "<green>Úloha splnená:</green> <yellow>{quest}</yellow> <gray>(+{points} bodov)</gray>", "<green>Quest complete:</green> <yellow>{quest}</yellow> <gray>(+{points} points)</gray>");
        put(sk, en, "shared-complete", "<green><bold>Spoločný cieľ splnený:</bold></green> <yellow>{quest}</yellow>", "<green><bold>Shared goal complete:</bold></green> <yellow>{quest}</yellow>");
        put(sk, en, "chapter-complete", "<gold><bold>Kapitola dokončená!</bold></gold> <gray>{chapter}</gray>", "<gold><bold>Chapter complete!</bold></gold> <gray>{chapter}</gray>");
        put(sk, en, "chapter-unlocked", "<aqua>Odomknutá nová kapitola!</aqua> <yellow>/vyprava kampan</yellow>", "<aqua>A new chapter is unlocked!</aqua> <yellow>/vyprava kampan</yellow>");
        put(sk, en, "party-complete", "<light_purple><bold>Úloha partie splnená:</bold></light_purple> <yellow>{quest}</yellow> <gray>(+{points} bodov)</gray>", "<light_purple><bold>Party quest complete:</bold></light_purple> <yellow>{quest}</yellow> <gray>(+{points} points)</gray>");
        put(sk, en, "reward-given", "<aqua>Odmena:</aqua> <white>{reward}</white>", "<aqua>Reward:</aqua> <white>{reward}</white>");
        put(sk, en, "link-sending", "Posielam kód na portál…", "Sending the code to the portal…");
        put(sk, en, "link-failed", "Portál kód neprijal. Skús /vyprava prepojit o chvíľu.", "The portal did not accept the code. Try /vyprava prepojit again in a moment.");
        put(sk, en, "link-code", "<green>Kód na prepojenie:</green> <white><bold>{code}</bold></white>", "<green>Link code:</green> <white><bold>{code}</bold></white>");
        put(sk, en, "link-hint", "Prihlás sa na webe cez Google a zadaj tento kód na svojom profile. Platí 15 minút.", "Sign in with Google on the website and enter this code on your profile. It lasts 15 minutes.");
        put(sk, en, "language-usage", "Použitie: /vyprava jazyk sk alebo /vyprava jazyk en", "Usage: /vyprava jazyk sk or /vyprava jazyk en");
        put(sk, en, "language-now", "Jazyk správ je {language}. Prepneš ho príkazom /vyprava jazyk sk alebo /vyprava jazyk en.", "Message language is {language}. Switch it with /vyprava jazyk sk or /vyprava jazyk en.");
        put(sk, en, "language-set", "Jazyk správ je nastavený na {language}.", "Message language is now {language}.");
        put(sk, en, "language-name-sk", "slovenčina", "Slovak");
        put(sk, en, "language-name-en", "angličtina", "English");
        put(sk, en, "chest-title", "Truhla", "Chest");
        put(sk, en, "chest-empty-board", "Zatiaľ prázdny rebríček", "Leaderboard is empty");
        put(sk, en, "chest-empty-board-lore", "Body sa ukážu, keď niekto splní úlohu.", "Points show up after someone finishes a quest.");
        put(sk, en, "chest-points", "Tvoje body: {points}", "Your points: {points}");
        put(sk, en, "chest-no-expedition", "Žiadna výprava", "No expedition");
        put(sk, en, "chest-not-tracking", "Úlohy sa teraz nesledujú.", "Quests are not being tracked right now.");
        put(sk, en, "chest-progress", "Postup: {current}/{amount}", "Progress: {current}/{amount}");
        put(sk, en, "chest-done", "Splnené", "Done");
        put(sk, en, "chest-click", "Klikni pre detail", "Click for details");
        put(sk, en, "chest-detail-progress", "<white>Postup:</white> <aqua>{current}/{amount}</aqua> <gray>(+{points} bodov)</gray>", "<white>Progress:</white> <aqua>{current}/{amount}</aqua> <gray>(+{points} points)</gray>");
        put(sk, en, "chest-points-short", "{points} bodov", "{points} points");
        Map<String, Map<String, String>> all = new HashMap<>();
        all.put(SK, Map.copyOf(sk));
        all.put(EN, Map.copyOf(en));
        return Map.copyOf(all);
    }

    private static void put(Map<String, String> sk, Map<String, String> en, String key, String slovak, String english) {
        sk.put(key, slovak);
        en.put(key, english);
    }
}
