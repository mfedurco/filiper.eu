package sk.vyprava.db;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class PortalClient implements AutoCloseable {
    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public Loaded load(String portalUrl, String serverId, String serverKey)
            throws IOException, InterruptedException, PortalRejectedException {
        JsonObject body = new JsonObject();
        body.addProperty("serverId", serverId);
        body.addProperty("op", "load");
        return parseLoad(post(portalUrl, serverKey, body));
    }

    public void heartbeat(String portalUrl, String serverId, String serverKey)
            throws IOException, InterruptedException, PortalRejectedException {
        post(portalUrl, serverKey, heartbeatBody(serverId));
    }

    static JsonObject heartbeatBody(String serverId) {
        JsonObject body = new JsonObject();
        body.addProperty("serverId", serverId);
        body.addProperty("op", "heartbeat");
        return body;
    }

    public void claim(String portalUrl, String serverId, String serverKey, UUID playerId, String name, String code)
            throws IOException, InterruptedException, PortalRejectedException {
        JsonObject body = new JsonObject();
        body.addProperty("serverId", serverId);
        body.addProperty("op", "claim");
        body.addProperty("uuid", playerId.toString());
        body.addProperty("name", name == null ? "" : name);
        body.addProperty("code", code);
        post(portalUrl, serverKey, body);
    }

    public void language(String portalUrl, String serverId, String serverKey, UUID playerId, String language)
            throws IOException, InterruptedException, PortalRejectedException {
        JsonObject body = new JsonObject();
        body.addProperty("serverId", serverId);
        body.addProperty("op", "language");
        body.addProperty("uuid", playerId.toString());
        body.addProperty("language", language);
        post(portalUrl, serverKey, body);
    }

    public void push(String portalUrl, String serverId, String serverKey, OutboxBatch batch, Map<String, GoalMeta> catalog)
            throws IOException, InterruptedException, PortalRejectedException {
        JsonObject body = new JsonObject();
        body.addProperty("serverId", serverId);
        body.addProperty("op", "push");
        body.add("players", players(batch));
        body.add("shared", shared(batch));
        body.add("parties", parties(batch));
        body.add("goals", goals(catalog));
        post(portalUrl, serverKey, body);
    }

    @Override
    public void close() {
        http.close();
    }

    static URI endpoint(String portalUrl) {
        if (portalUrl == null || portalUrl.isBlank()) {
            throw new IllegalArgumentException("portal-url is blank.");
        }
        String trimmed = portalUrl.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        URI uri = URI.create(trimmed + "/api/plugin/sync");
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getHost().isBlank()) {
            throw new IllegalArgumentException("portal-url must start with https.");
        }
        if (uri.getRawUserInfo() != null && !uri.getRawUserInfo().isBlank()) {
            throw new IllegalArgumentException("portal-url must not include credentials.");
        }
        return uri;
    }

    private JsonObject post(String portalUrl, String serverKey, JsonObject body)
            throws IOException, InterruptedException, PortalRejectedException {
        HttpRequest request = HttpRequest.newBuilder(endpoint(portalUrl))
                .timeout(Duration.ofSeconds(20))
                .header("Authorization", "Bearer " + serverKey)
                .header("Content-Type", "application/json; charset=utf-8")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8))
                .build();
        HttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
        int status = response.statusCode();
        if (status == 401 || status == 403) {
            throw new PortalRejectedException();
        }
        if (status / 100 != 2) {
            throw new IOException("Portal returned HTTP " + status);
        }
        byte[] bytes = response.body();
        if (bytes != null && bytes.length > 2_000_000) {
            throw new IOException("Portal response is too large.");
        }
        String payload = bytes == null ? "" : new String(bytes, StandardCharsets.UTF_8);
        if (payload.isBlank()) {
            return new JsonObject();
        }
        JsonElement parsed = JsonParser.parseString(payload);
        if (!parsed.isJsonObject()) {
            throw new IOException("Portal returned a response that is not an object.");
        }
        return parsed.getAsJsonObject();
    }

    private static Loaded parseLoad(JsonObject root) throws IOException {
        ExpeditionRecord expedition = null;
        if (root.has("expedition") && root.get("expedition").isJsonObject()) {
            JsonObject exp = root.getAsJsonObject("expedition");
            try {
                expedition = new ExpeditionRecord(
                        UUID.fromString(text(exp, "id")),
                        text(exp, "slug"),
                        text(exp, "title"),
                        text(exp, "description"),
                        text(exp, "status"),
                        time(exp, "startsAt"),
                        time(exp, "endsAt")
                );
            } catch (RuntimeException error) {
                throw new IOException("Portal expedition payload is invalid.");
            }
        }
        List<QuestRecord> quests = new ArrayList<>();
        if (root.has("quests") && root.get("quests").isJsonArray()) {
            for (JsonElement element : root.getAsJsonArray("quests")) {
                if (element.isJsonObject()) {
                    quests.add(readQuest(element.getAsJsonObject()));
                }
            }
        }
        return new Loaded(expedition, List.copyOf(quests));
    }

    private static QuestRecord readQuest(JsonObject row) {
        return new QuestRecord(
                text(row, "stableKey"),
                text(row, "kind"),
                text(row, "title"),
                text(row, "description"),
                number(row, "points"),
                number(row, "targetCount"),
                text(row, "trackingType"),
                strings(row.get("filterValues")),
                number(row, "sortOrder"),
                row.has("active") && !row.get("active").isJsonNull() && row.get("active").getAsBoolean(),
                number(row, "minChapter"),
                jsonText(row, "rewardsJson"),
                nullable(row, "chapterKey"),
                nullableInt(row, "chapterOrder"),
                nullable(row, "chapterTitle"),
                nullable(row, "chapterDescription"),
                nullable(row, "milestoneName"),
                number(row, "milestonePoints"),
                jsonText(row, "milestoneRewardsJson")
        );
    }

    private static JsonArray players(OutboxBatch batch) {
        JsonArray array = new JsonArray();
        for (OutboxBatch.PlayerPush push : batch.players()) {
            JsonObject item = new JsonObject();
            item.addProperty("expeditionId", push.expeditionId());
            item.add("snapshot", player(push.snapshot()));
            array.add(item);
        }
        return array;
    }

    private static JsonObject player(PlayerSnapshot snapshot) {
        JsonObject map = new JsonObject();
        map.addProperty("uuid", snapshot.uuid().toString());
        map.addProperty("name", snapshot.name());
        map.addProperty("nameNote", "");
        map.addProperty("chapter", snapshot.chapter());
        map.addProperty("totalPoints", snapshot.totalPoints());
        map.addProperty("weeklyPoints", snapshot.weeklyPoints());
        map.addProperty("partyId", snapshot.partyId() == null ? "" : snapshot.partyId());
        map.addProperty("language", snapshot.language() == null ? "" : snapshot.language());
        JsonObject quests = new JsonObject();
        for (Map.Entry<String, QuestRow> entry : snapshot.quests().entrySet()) {
            JsonObject row = new JsonObject();
            row.addProperty("goalKind", entry.getValue().goalKind());
            row.addProperty("current", entry.getValue().current());
            row.addProperty("completed", entry.getValue().completed());
            quests.add(entry.getKey(), row);
        }
        map.add("quests", quests);
        return map;
    }

    private static JsonArray shared(OutboxBatch batch) {
        JsonArray array = new JsonArray();
        for (OutboxBatch.SharedPush push : batch.shared()) {
            SharedSnapshot snapshot = push.snapshot();
            JsonObject map = new JsonObject();
            map.addProperty("questKey", snapshot.questKey());
            map.addProperty("progress", snapshot.progress());
            map.addProperty("completed", snapshot.completed());
            map.addProperty("periodKey", snapshot.periodKey());
            map.add("contributions", amounts(snapshot.contributions()));
            JsonObject item = new JsonObject();
            item.addProperty("expeditionId", push.expeditionId());
            item.add("snapshot", map);
            array.add(item);
        }
        return array;
    }

    private static JsonArray parties(OutboxBatch batch) {
        JsonArray array = new JsonArray();
        for (OutboxBatch.PartyPush push : batch.parties()) {
            PartySnapshot snapshot = push.snapshot();
            JsonObject map = new JsonObject();
            map.addProperty("partyId", snapshot.partyId());
            map.addProperty("name", snapshot.name());
            map.addProperty("leader", snapshot.leader() == null ? "" : snapshot.leader().toString());
            map.addProperty("questKey", snapshot.questKey() == null ? "" : snapshot.questKey());
            map.addProperty("progress", snapshot.progress());
            map.addProperty("completed", snapshot.completed());
            map.add("contributions", amounts(snapshot.contributions()));
            JsonObject item = new JsonObject();
            item.addProperty("expeditionId", push.expeditionId());
            item.add("snapshot", map);
            array.add(item);
        }
        return array;
    }

    private static JsonObject amounts(Map<UUID, Integer> contributions) {
        JsonObject map = new JsonObject();
        for (Map.Entry<UUID, Integer> entry : contributions.entrySet()) {
            map.addProperty(entry.getKey().toString(), entry.getValue());
        }
        return map;
    }

    private static JsonObject goals(Map<String, GoalMeta> catalog) {
        JsonObject map = new JsonObject();
        if (catalog == null) {
            return map;
        }
        for (Map.Entry<String, GoalMeta> entry : catalog.entrySet()) {
            GoalMeta meta = entry.getValue();
            JsonObject row = new JsonObject();
            row.addProperty("goalKind", meta.goalKind());
            row.addProperty("name", meta.name());
            row.addProperty("description", meta.description());
            row.addProperty("objectiveType", meta.objectiveType());
            JsonArray targets = new JsonArray();
            for (String target : meta.targets()) {
                targets.add(target);
            }
            row.add("targets", targets);
            row.addProperty("amount", meta.amount());
            row.addProperty("points", meta.points());
            row.addProperty("minChapter", meta.minChapter());
            if (meta.chapterId() == null) {
                row.add("chapterId", JsonParser.parseString("null"));
            } else {
                row.addProperty("chapterId", meta.chapterId());
            }
            if (meta.chapterOrder() == null) {
                row.add("chapterOrder", JsonParser.parseString("null"));
            } else {
                row.addProperty("chapterOrder", meta.chapterOrder());
            }
            row.addProperty("rewardsJson", meta.rewardsJson());
            map.add(entry.getKey(), row);
        }
        return map;
    }

    private static List<String> strings(JsonElement element) {
        List<String> values = new ArrayList<>();
        if (element == null || !element.isJsonArray()) {
            return List.of();
        }
        for (JsonElement item : element.getAsJsonArray()) {
            if (item != null && item.isJsonPrimitive()) {
                values.add(item.getAsString());
            }
        }
        return List.copyOf(values);
    }

    private static String text(JsonObject object, String name) {
        String value = nullable(object, name);
        return value == null ? "" : value;
    }

    private static String nullable(JsonObject object, String name) {
        if (!object.has(name) || object.get(name).isJsonNull()) {
            return null;
        }
        return object.get(name).getAsString();
    }

    private static String jsonText(JsonObject object, String name) {
        if (!object.has(name) || object.get(name).isJsonNull()) {
            return "[]";
        }
        JsonElement element = object.get(name);
        return element.isJsonPrimitive() ? element.getAsString() : element.toString();
    }

    private static int number(JsonObject object, String name) {
        if (!object.has(name) || object.get(name).isJsonNull()) {
            return 0;
        }
        return object.get(name).getAsInt();
    }

    private static Integer nullableInt(JsonObject object, String name) {
        if (!object.has(name) || object.get(name).isJsonNull()) {
            return null;
        }
        return object.get(name).getAsInt();
    }

    private static OffsetDateTime time(JsonObject object, String name) {
        String value = nullable(object, name);
        if (value == null || value.isBlank()) {
            return null;
        }
        return OffsetDateTime.parse(value);
    }

    public record Loaded(ExpeditionRecord expedition, List<QuestRecord> quests) {
    }
}
