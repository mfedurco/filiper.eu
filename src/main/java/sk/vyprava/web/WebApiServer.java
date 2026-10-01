package sk.vyprava.web;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.bukkit.configuration.file.FileConfiguration;
import sk.vyprava.model.ChapterDefinition;
import sk.vyprava.model.PartyData;
import sk.vyprava.model.PlayerProgress;
import sk.vyprava.model.QuestDefinition;
import sk.vyprava.model.RewardItem;
import sk.vyprava.model.SharedGoalData;
import sk.vyprava.quest.QuestService;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.logging.Logger;

/**
 * HTTP JSON API pre web / Supabase sync.
 * GET /api/health, /campaign, /daily, /weekly, /longterm, /shared, /party-quests,
 * /leaderboard, /players, /parties
 */
public final class WebApiServer {
    private final QuestService quests;
    private final Logger logger;
    private final Gson gson = new GsonBuilder().setPrettyPrinting().create();
    private final String apiToken;
    private HttpServer server;

    public WebApiServer(QuestService quests, FileConfiguration config, Logger logger) {
        this.quests = quests;
        this.logger = logger;
        this.apiToken = config.getString("web.api-token", "");
    }

    public void start(int port, String bind) throws IOException {
        server = HttpServer.create(new InetSocketAddress(bind, port), 0);
        server.createContext("/api/health", this::health);
        server.createContext("/api/campaign", this::campaign);
        server.createContext("/api/daily", this::daily);
        server.createContext("/api/weekly", this::weekly);
        server.createContext("/api/longterm", this::longterm);
        server.createContext("/api/shared", this::shared);
        server.createContext("/api/party-quests", this::partyQuests);
        server.createContext("/api/leaderboard", this::leaderboard);
        server.createContext("/api/players", this::players);
        server.createContext("/api/parties", this::parties);
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
        logger.info("Výprava Web API beží na http://" + bind + ":" + port + "/api/health");
    }

    public void stop() {
        if (server != null) {
            server.stop(0);
            server = null;
        }
    }

    private boolean authorized(HttpExchange exchange) {
        if (apiToken == null || apiToken.isBlank()) {
            return true;
        }
        String header = exchange.getRequestHeaders().getFirst("X-Vyprava-Token");
        return apiToken.equals(header);
    }

    private void health(HttpExchange exchange) throws IOException {
        writeJson(exchange, 200, Map.of(
                "ok", true,
                "plugin", "Vyprava",
                "week", quests.weekKey(),
                "season", quests.seasonKey()
        ));
    }

    private void campaign(HttpExchange exchange) throws IOException {
        if (!authorized(exchange)) {
            writeJson(exchange, 401, Map.of("error", "unauthorized"));
            return;
        }
        List<Map<String, Object>> chapters = new ArrayList<>();
        for (ChapterDefinition chapter : quests.registry().chapters()) {
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("id", chapter.id());
            c.put("order", chapter.order());
            c.put("name", chapter.name());
            c.put("description", chapter.description());
            c.put("quests", questMaps(chapter.quests()));
            Map<String, Object> milestone = new LinkedHashMap<>();
            milestone.put("name", chapter.milestoneName());
            milestone.put("points", chapter.milestonePoints());
            milestone.put("rewards", rewardMaps(chapter.milestoneRewards()));
            c.put("milestone", milestone);
            chapters.add(c);
        }
        writeJson(exchange, 200, Map.of("title", "Cesta Preživších", "chapters", chapters));
    }

    private void daily(HttpExchange exchange) throws IOException {
        if (!authorized(exchange)) {
            writeJson(exchange, 401, Map.of("error", "unauthorized"));
            return;
        }
        writeJson(exchange, 200, Map.of("pool", questMaps(new ArrayList<>(quests.registry().dailyPool().values()))));
    }

    private void weekly(HttpExchange exchange) throws IOException {
        if (!authorized(exchange)) {
            writeJson(exchange, 401, Map.of("error", "unauthorized"));
            return;
        }
        writeJson(exchange, 200, Map.of(
                "week", quests.weekKey(),
                "pool", questMaps(new ArrayList<>(quests.registry().weeklyPool().values()))
        ));
    }

    private void longterm(HttpExchange exchange) throws IOException {
        if (!authorized(exchange)) {
            writeJson(exchange, 401, Map.of("error", "unauthorized"));
            return;
        }
        writeJson(exchange, 200, Map.of(
                "season", quests.seasonKey(),
                "pool", questMaps(new ArrayList<>(quests.registry().longTermPool().values()))
        ));
    }

    private void shared(HttpExchange exchange) throws IOException {
        if (!authorized(exchange)) {
            writeJson(exchange, 401, Map.of("error", "unauthorized"));
            return;
        }
        List<Map<String, Object>> goals = new ArrayList<>();
        for (SharedGoalData goal : quests.activeSharedGoals()) {
            quests.registry().sharedQuest(goal.questId()).ifPresent(quest -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", goal.id());
                row.put("questId", quest.id());
                row.put("name", quest.name());
                row.put("description", quest.description());
                row.put("type", quest.type().name());
                row.put("targets", quest.targets());
                row.put("amount", quest.amount());
                row.put("points", quest.points());
                row.put("progress", goal.progress());
                row.put("completed", goal.completed());
                row.put("periodKey", goal.periodKey());
                row.put("rewards", rewardMaps(quest.rewards()));
                List<Map<String, Object>> contrib = new ArrayList<>();
                goal.contributions().entrySet().stream()
                        .sorted(Map.Entry.<UUID, Integer>comparingByValue().reversed())
                        .forEach(e -> {
                            Map<String, Object> c = new LinkedHashMap<>();
                            c.put("uuid", e.getKey().toString());
                            c.put("name", quests.store().find(e.getKey()).map(PlayerProgress::name).orElse("Unknown"));
                            c.put("amount", e.getValue());
                            contrib.add(c);
                        });
                row.put("contributions", contrib);
                goals.add(row);
            });
        }
        writeJson(exchange, 200, Map.of(
                "week", quests.weekKey(),
                "pool", questMaps(new ArrayList<>(quests.registry().sharedPool().values())),
                "active", goals
        ));
    }

    private void partyQuests(HttpExchange exchange) throws IOException {
        if (!authorized(exchange)) {
            writeJson(exchange, 401, Map.of("error", "unauthorized"));
            return;
        }
        writeJson(exchange, 200, Map.of("pool", questMaps(new ArrayList<>(quests.registry().partyPool().values()))));
    }

    private void leaderboard(HttpExchange exchange) throws IOException {
        if (!authorized(exchange)) {
            writeJson(exchange, 401, Map.of("error", "unauthorized"));
            return;
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (PlayerProgress p : quests.leaderboard().topTotal(50)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("uuid", p.uuid().toString());
            row.put("name", p.name());
            row.put("totalPoints", p.totalPoints());
            row.put("weeklyPoints", p.weeklyPoints());
            row.put("chapter", p.currentChapterOrder());
            rows.add(row);
        }
        writeJson(exchange, 200, Map.of("leaderboard", rows));
    }

    private void players(HttpExchange exchange) throws IOException {
        if (!authorized(exchange)) {
            writeJson(exchange, 401, Map.of("error", "unauthorized"));
            return;
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (PlayerProgress p : quests.store().allPlayers().values()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("uuid", p.uuid().toString());
            row.put("name", p.name());
            row.put("chapter", p.currentChapterOrder());
            row.put("totalPoints", p.totalPoints());
            row.put("weeklyPoints", p.weeklyPoints());
            row.put("completedCampaign", p.completedCampaign());
            row.put("completedChapters", p.completedChapters());
            row.put("assignedDaily", p.assignedDaily());
            row.put("completedDaily", p.completedDaily());
            row.put("dailyProgress", p.dailyProgress());
            row.put("assignedWeekly", p.assignedWeekly());
            row.put("completedWeekly", p.completedWeekly());
            row.put("weeklyProgress", p.weeklyProgress());
            row.put("assignedLongTerm", p.assignedLongTerm());
            row.put("completedLongTerm", p.completedLongTerm());
            row.put("longTermProgress", p.longTermProgress());
            row.put("campaignProgress", p.campaignProgress());
            row.put("partyId", p.partyId());
            row.put("dailyDate", p.dailyDate());
            row.put("weeklyKey", p.weeklyKey());
            row.put("longTermSeason", p.longTermSeason());
            rows.add(row);
        }
        writeJson(exchange, 200, Map.of("players", rows));
    }

    private void parties(HttpExchange exchange) throws IOException {
        if (!authorized(exchange)) {
            writeJson(exchange, 401, Map.of("error", "unauthorized"));
            return;
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (PartyData party : quests.store().allParties().values()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", party.id());
            row.put("name", party.name());
            row.put("leader", party.leader().toString());
            row.put("members", party.members().stream().map(Object::toString).toList());
            row.put("activeQuestId", party.activeQuestId());
            row.put("questProgress", party.questProgress());
            row.put("questCompleted", party.questCompleted());
            List<Map<String, Object>> contrib = new ArrayList<>();
            party.contribution().forEach((uuid, amount) -> {
                Map<String, Object> c = new LinkedHashMap<>();
                c.put("uuid", uuid.toString());
                c.put("name", quests.store().find(uuid).map(PlayerProgress::name).orElse("Unknown"));
                c.put("amount", amount);
                contrib.add(c);
            });
            row.put("contributions", contrib);
            rows.add(row);
        }
        writeJson(exchange, 200, Map.of("parties", rows));
    }

    private List<Map<String, Object>> questMaps(List<QuestDefinition> quests) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (QuestDefinition q : quests) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", q.id());
            m.put("name", q.name());
            m.put("description", q.description());
            m.put("type", q.type().name());
            m.put("targets", q.targets());
            m.put("amount", q.amount());
            m.put("points", q.points());
            m.put("minChapter", q.minChapter());
            m.put("scope", q.scope().name());
            m.put("rewards", rewardMaps(q.rewards()));
            out.add(m);
        }
        return out;
    }

    private List<Map<String, Object>> rewardMaps(List<RewardItem> rewards) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (RewardItem r : rewards) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("material", r.material().name());
            m.put("amount", r.amount());
            out.add(m);
        }
        return out;
    }

    private void writeJson(HttpExchange exchange, int status, Object body) throws IOException {
        Headers headers = exchange.getResponseHeaders();
        headers.set("Content-Type", "application/json; charset=utf-8");
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Allow-Headers", "Content-Type, X-Vyprava-Token");
        headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }
        byte[] bytes = gson.toJson(body).getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
