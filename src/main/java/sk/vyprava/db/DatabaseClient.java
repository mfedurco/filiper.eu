package sk.vyprava.db;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.postgresql.ds.PGSimpleDataSource;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.sql.Array;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;

public final class DatabaseClient implements AutoCloseable {
    private final HikariDataSource pool;

    private DatabaseClient(HikariDataSource pool) {
        this.pool = pool;
    }

    public static DatabaseClient open(String url) {
        silenceDriverLogs();
        PGSimpleDataSource source = dataSource(url);
        HikariConfig config = new HikariConfig();
        config.setDataSource(source);
        config.setPoolName("vyprava-neon");
        config.setMaximumPoolSize(2);
        config.setMinimumIdle(0);
        config.setConnectionTimeout(15_000);
        config.setValidationTimeout(5_000);
        config.setIdleTimeout(60_000);
        config.setMaxLifetime(180_000);
        config.setKeepaliveTime(30_000);
        config.setAutoCommit(true);
        return new DatabaseClient(new HikariDataSource(config));
    }

    public static PGSimpleDataSource dataSource(String raw) {
        silenceDriverLogs();
        ParsedUrl parsed = parse(raw);
        PGSimpleDataSource source = new PGSimpleDataSource();
        source.setUrl(parsed.jdbcUrl());
        if (parsed.user() != null) {
            source.setUser(parsed.user());
        }
        if (parsed.password() != null) {
            source.setPassword(parsed.password());
        }
        return source;
    }

    public static Connection connect(String raw) throws SQLException {
        return dataSource(raw).getConnection();
    }

    /**
     * JDBC URL without userinfo. Credentials are applied with {@code setUser}/{@code setPassword}
     * so a rejected URL cannot echo them.
     */
    static ParsedUrl parse(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("JDBC URL chýba.");
        }
        String normalized = raw.trim();
        if (normalized.startsWith("jdbc:")) {
            normalized = normalized.substring("jdbc:".length());
        }
        URI uri;
        try {
            uri = URI.create(normalized);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("JDBC URL nie je platná.");
        }
        if (uri.getHost() == null || uri.getPath() == null || uri.getPath().length() <= 1) {
            throw new IllegalArgumentException("JDBC URL nie je platná.");
        }
        String user = null;
        String password = null;
        String userInfo = uri.getRawUserInfo();
        if (userInfo != null && !userInfo.isBlank()) {
            int colon = userInfo.indexOf(':');
            if (colon < 0) {
                user = decode(userInfo);
            } else {
                user = decode(userInfo.substring(0, colon));
                password = decode(userInfo.substring(colon + 1));
            }
        }
        String query = uri.getRawQuery();
        if (query == null || !query.contains("sslmode=")) {
            query = query == null || query.isBlank() ? "sslmode=require" : query + "&sslmode=require";
        }
        String jdbc = "jdbc:postgresql://" + uri.getHost()
                + (uri.getPort() > 0 ? ":" + uri.getPort() : "")
                + uri.getPath()
                + "?" + query;
        return new ParsedUrl(jdbc, user, password);
    }

    private static String decode(String value) {
        return URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8);
    }

    private static void silenceDriverLogs() {
        Logger.getLogger("org.postgresql").setLevel(Level.SEVERE);
        Logger.getLogger("com.zaxxer.hikari").setLevel(Level.SEVERE);
    }

    record ParsedUrl(String jdbcUrl, String user, String password) {
    }

    public void ping() throws SQLException {
        try (Connection connection = pool.getConnection();
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("select 1")) {
            if (!rs.next()) {
                throw new SQLException("Databáza nevrátila kontrolný riadok.");
            }
        }
    }

    public Optional<ExpeditionRecord> syncSchedule(Instant now, String serverId) throws SQLException {
        requireServer(serverId);
        try (Connection connection = pool.getConnection()) {
            connection.setAutoCommit(false);
            try {
                ensureServer(connection, serverId);
                try (PreparedStatement statement = connection.prepareStatement(
                        "select changed, active_id, active_slug, ended_slug from apply_expedition_schedule(?, ?)")) {
                    statement.setObject(1, OffsetDateTime.ofInstant(now, ZoneOffset.UTC));
                    statement.setString(2, serverId);
                    try (ResultSet rs = statement.executeQuery()) {
                        if (rs.next()) {
                            // The row reports what changed. The active expedition is loaded next.
                        }
                    }
                }
                connection.commit();
            } catch (SQLException | RuntimeException error) {
                connection.rollback();
                throw error;
            } finally {
                connection.setAutoCommit(true);
            }
        }
        return loadActive(serverId);
    }

    public Optional<ExpeditionRecord> loadActive(String serverId) throws SQLException {
        requireServer(serverId);
        try (Connection connection = pool.getConnection();
             PreparedStatement statement = connection.prepareStatement("""
                     select id, slug, title, description, status::text as status, starts_at, ends_at
                     from expeditions
                     where status = 'active' and server_id = ?
                     limit 1
                     """)) {
            statement.setString(1, serverId);
            try (ResultSet rs = statement.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.of(readExpedition(rs));
            }
        }
    }

    public int countActiveQuests(String serverId) throws SQLException {
        requireServer(serverId);
        try (Connection connection = pool.getConnection();
             PreparedStatement statement = connection.prepareStatement("""
                     select count(q.id)::int
                     from expeditions e
                     join quest_definitions q
                       on q.expedition_id = e.id and q.server_id = e.server_id and q.active
                     where e.status = 'active' and e.server_id = ?
                     """)) {
            statement.setString(1, serverId);
            try (ResultSet rs = statement.executeQuery()) {
                return rs.next() ? rs.getInt(1) : 0;
            }
        }
    }

    public List<QuestRecord> loadQuests(UUID expeditionId, String serverId) throws SQLException {
        requireServer(serverId);
        try (Connection connection = pool.getConnection();
             PreparedStatement statement = connection.prepareStatement("""
                     select stable_key, kind::text, title, description, points, target_count,
                            tracking_type::text, filter_values, sort_order, active, min_chapter,
                            rewards::text, chapter_key, chapter_order, chapter_title, chapter_description,
                            milestone_name, milestone_points, milestone_rewards::text
                     from quest_definitions
                     where expedition_id = ? and server_id = ? and active
                     order by sort_order, stable_key
                     """)) {
            statement.setObject(1, expeditionId);
            statement.setString(2, serverId);
            try (ResultSet rs = statement.executeQuery()) {
                List<QuestRecord> quests = new ArrayList<>();
                while (rs.next()) {
                    quests.add(new QuestRecord(
                            rs.getString("stable_key"),
                            rs.getString("kind"),
                            rs.getString("title"),
                            rs.getString("description"),
                            rs.getInt("points"),
                            rs.getInt("target_count"),
                            rs.getString("tracking_type"),
                            readTextArray(rs, "filter_values"),
                            rs.getInt("sort_order"),
                            rs.getBoolean("active"),
                            rs.getInt("min_chapter"),
                            rs.getString("rewards"),
                            rs.getString("chapter_key"),
                            (Integer) rs.getObject("chapter_order"),
                            rs.getString("chapter_title"),
                            rs.getString("chapter_description"),
                            rs.getString("milestone_name"),
                            rs.getInt("milestone_points"),
                            rs.getString("milestone_rewards")
                    ));
                }
                return quests;
            }
        }
    }

    public void push(OutboxBatch batch, Map<String, GoalMeta> catalog, String serverId) throws SQLException {
        requireServer(serverId);
        try (Connection connection = pool.getConnection()) {
            connection.setAutoCommit(false);
            try {
                ensureServer(connection, serverId);
                for (OutboxBatch.PlayerPush push : batch.players()) {
                    pushPlayer(connection, serverId, UUID.fromString(push.expeditionId()), push.snapshot(), catalog);
                }
                for (OutboxBatch.SharedPush push : batch.shared()) {
                    pushShared(connection, serverId, UUID.fromString(push.expeditionId()), push.snapshot(), catalog);
                }
                for (OutboxBatch.PartyPush push : batch.parties()) {
                    pushParty(connection, serverId, UUID.fromString(push.expeditionId()), push.snapshot(), catalog);
                }
                connection.commit();
            } catch (SQLException | RuntimeException error) {
                connection.rollback();
                throw error;
            } finally {
                connection.setAutoCommit(true);
            }
        }
    }

    public void applyScript(String sql) throws SQLException {
        for (String statement : SqlScripts.split(sql)) {
            try (Connection connection = pool.getConnection();
                 Statement jdbc = connection.createStatement()) {
                jdbc.execute(statement);
            }
        }
    }

    private void pushPlayer(Connection connection, String serverId, UUID expeditionId, PlayerSnapshot snapshot, Map<String, GoalMeta> catalog)
            throws SQLException {
        UUID playerId = upsertPlayer(connection, serverId, snapshot);
        upsertLeaderboard(connection, serverId, expeditionId, playerId, snapshot);
        try (PreparedStatement delete = connection.prepareStatement("""
                delete from player_progress
                where player_id = ? and expedition_id = ? and server_id = ?
                """)) {
            delete.setObject(1, playerId);
            delete.setObject(2, expeditionId);
            delete.setString(3, serverId);
            delete.executeUpdate();
        }
        for (Map.Entry<String, QuestRow> entry : snapshot.quests().entrySet()) {
            ensureGoal(connection, entry.getKey(), entry.getValue().goalKind(), catalog.get(entry.getKey()));
            try (PreparedStatement insert = connection.prepareStatement("""
                    insert into player_progress (
                      player_id, goal_id, expedition_id, server_id, current_amount, completed, updated_at
                    ) values (?, ?, ?, ?, ?, ?, now())
                    """)) {
                insert.setObject(1, playerId);
                insert.setString(2, entry.getKey());
                insert.setObject(3, expeditionId);
                insert.setString(4, serverId);
                insert.setInt(5, entry.getValue().current());
                insert.setBoolean(6, entry.getValue().completed());
                insert.executeUpdate();
            }
        }
    }

    private void pushShared(Connection connection, String serverId, UUID expeditionId, SharedSnapshot snapshot, Map<String, GoalMeta> catalog)
            throws SQLException {
        ensureGoal(connection, snapshot.questKey(), "shared", catalog.get(snapshot.questKey()));
        try (PreparedStatement upsert = connection.prepareStatement("""
                insert into shared_goal_state (
                  goal_id, expedition_id, server_id, progress, completed, period_key, updated_at
                ) values (?, ?, ?, ?, ?, ?, now())
                on conflict (server_id, expedition_id, goal_id) where expedition_id is not null
                do update set
                  progress = excluded.progress,
                  completed = excluded.completed,
                  period_key = excluded.period_key,
                  updated_at = now()
                """)) {
            upsert.setString(1, snapshot.questKey());
            upsert.setObject(2, expeditionId);
            upsert.setString(3, serverId);
            upsert.setInt(4, snapshot.progress());
            upsert.setBoolean(5, snapshot.completed());
            if (snapshot.periodKey().isBlank()) {
                upsert.setNull(6, Types.VARCHAR);
            } else {
                upsert.setString(6, snapshot.periodKey());
            }
            upsert.executeUpdate();
        }
        replaceContributions(connection, serverId, expeditionId, snapshot.questKey(), snapshot.contributions());
    }

    private void pushParty(Connection connection, String serverId, UUID expeditionId, PartySnapshot snapshot, Map<String, GoalMeta> catalog)
            throws SQLException {
        try (PreparedStatement upsert = connection.prepareStatement("""
                insert into parties (
                  server_id, expedition_id, party_key, name, leader_mc_uuid,
                  quest_key, quest_progress, quest_completed, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, now())
                on conflict (server_id, expedition_id, party_key) where expedition_id is not null
                do update set
                  name = excluded.name,
                  leader_mc_uuid = excluded.leader_mc_uuid,
                  quest_key = excluded.quest_key,
                  quest_progress = excluded.quest_progress,
                  quest_completed = excluded.quest_completed,
                  updated_at = now()
                """)) {
            upsert.setString(1, serverId);
            upsert.setObject(2, expeditionId);
            upsert.setString(3, snapshot.partyId());
            upsert.setString(4, snapshot.name());
            if (snapshot.leader() == null) {
                upsert.setNull(5, Types.VARCHAR);
            } else {
                upsert.setString(5, snapshot.leader().toString());
            }
            if (snapshot.questKey().isBlank()) {
                upsert.setNull(6, Types.VARCHAR);
            } else {
                upsert.setString(6, snapshot.questKey());
            }
            upsert.setInt(7, snapshot.progress());
            upsert.setBoolean(8, snapshot.completed());
            upsert.executeUpdate();
        }
        if (snapshot.questKey().isBlank()) {
            return;
        }
        ensureGoal(connection, snapshot.questKey(), "party", catalog.get(snapshot.questKey()));
        for (Map.Entry<UUID, Integer> entry : snapshot.contributions().entrySet()) {
            UUID playerId = findPlayerId(connection, serverId, entry.getKey());
            if (playerId == null) {
                continue;
            }
            try (PreparedStatement insert = connection.prepareStatement("""
                    insert into contributions (goal_id, player_id, expedition_id, server_id, amount, updated_at)
                    values (?, ?, ?, ?, ?, now())
                    on conflict (server_id, expedition_id, goal_id, player_id) where expedition_id is not null
                    do update set amount = excluded.amount, updated_at = now()
                    """)) {
                insert.setString(1, snapshot.questKey());
                insert.setObject(2, playerId);
                insert.setObject(3, expeditionId);
                insert.setString(4, serverId);
                insert.setInt(5, entry.getValue());
                insert.executeUpdate();
            }
        }
    }

    private void replaceContributions(Connection connection, String serverId, UUID expeditionId, String goalId, Map<UUID, Integer> contributions)
            throws SQLException {
        try (PreparedStatement delete = connection.prepareStatement("""
                delete from contributions
                where goal_id = ? and expedition_id = ? and server_id = ?
                """)) {
            delete.setString(1, goalId);
            delete.setObject(2, expeditionId);
            delete.setString(3, serverId);
            delete.executeUpdate();
        }
        for (Map.Entry<UUID, Integer> entry : contributions.entrySet()) {
            UUID playerId = findPlayerId(connection, serverId, entry.getKey());
            if (playerId == null) {
                continue;
            }
            try (PreparedStatement insert = connection.prepareStatement("""
                    insert into contributions (goal_id, player_id, expedition_id, server_id, amount, updated_at)
                    values (?, ?, ?, ?, ?, now())
                    """)) {
                insert.setString(1, goalId);
                insert.setObject(2, playerId);
                insert.setObject(3, expeditionId);
                insert.setString(4, serverId);
                insert.setInt(5, entry.getValue());
                insert.executeUpdate();
            }
        }
    }

    private UUID upsertPlayer(Connection connection, String serverId, PlayerSnapshot snapshot) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                insert into players (mc_uuid, name, chapter, total_points, weekly_points, party_id, server_id, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, now())
                on conflict (server_id, mc_uuid) do update set
                  name = excluded.name,
                  chapter = excluded.chapter,
                  total_points = excluded.total_points,
                  weekly_points = excluded.weekly_points,
                  party_id = excluded.party_id,
                  updated_at = now()
                returning id
                """)) {
            statement.setString(1, snapshot.uuid().toString());
            statement.setString(2, snapshot.name());
            statement.setInt(3, Math.max(1, snapshot.chapter()));
            statement.setInt(4, snapshot.totalPoints());
            statement.setInt(5, snapshot.weeklyPoints());
            if (snapshot.partyId() == null || snapshot.partyId().isBlank()) {
                statement.setNull(6, Types.VARCHAR);
            } else {
                statement.setString(6, snapshot.partyId());
            }
            statement.setString(7, serverId);
            try (ResultSet rs = statement.executeQuery()) {
                if (!rs.next()) {
                    throw new SQLException("Upsert hráča nevrátil id.");
                }
                return uuid(rs, "id");
            }
        }
    }

    private void upsertLeaderboard(Connection connection, String serverId, UUID expeditionId, UUID playerId, PlayerSnapshot snapshot)
            throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                insert into leaderboard_snapshot (
                  player_id, expedition_id, server_id, name, total_points, weekly_points, chapter, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?, now())
                on conflict (server_id, expedition_id, player_id) where expedition_id is not null
                do update set
                  name = excluded.name,
                  total_points = excluded.total_points,
                  weekly_points = excluded.weekly_points,
                  chapter = excluded.chapter,
                  updated_at = now()
                """)) {
            statement.setObject(1, playerId);
            statement.setObject(2, expeditionId);
            statement.setString(3, serverId);
            statement.setString(4, snapshot.name());
            statement.setInt(5, snapshot.totalPoints());
            statement.setInt(6, snapshot.weeklyPoints());
            statement.setInt(7, Math.max(1, snapshot.chapter()));
            statement.executeUpdate();
        }
    }

    private void ensureGoal(Connection connection, String goalId, String fallbackKind, GoalMeta meta) throws SQLException {
        if (meta != null) {
            try (PreparedStatement statement = connection.prepareStatement("""
                    insert into goals (
                      id, kind, name, description, objective_type, targets, amount, points,
                      min_chapter, chapter_id, chapter_order, rewards, active
                    ) values (
                      ?, ?::goal_kind, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, true
                    )
                    on conflict (id) do nothing
                    """)) {
                statement.setString(1, goalId);
                statement.setString(2, meta.goalKind());
                statement.setString(3, meta.name());
                statement.setString(4, meta.description());
                statement.setString(5, meta.objectiveType());
                statement.setArray(6, textArray(connection, meta.targets()));
                statement.setInt(7, meta.amount());
                statement.setInt(8, meta.points());
                statement.setInt(9, meta.minChapter());
                if (meta.chapterId() == null) {
                    statement.setNull(10, Types.VARCHAR);
                } else {
                    statement.setString(10, meta.chapterId());
                }
                if (meta.chapterOrder() == null) {
                    statement.setNull(11, Types.INTEGER);
                } else {
                    statement.setInt(11, meta.chapterOrder());
                }
                statement.setString(12, meta.rewardsJson());
                statement.executeUpdate();
            }
            return;
        }
        try (PreparedStatement statement = connection.prepareStatement("""
                insert into goals (id, kind, name, objective_type, amount, active)
                values (?, ?::goal_kind, ?, 'BREAK_BLOCK', 1, true)
                on conflict (id) do nothing
                """)) {
            statement.setString(1, goalId);
            statement.setString(2, fallbackKind == null || fallbackKind.isBlank() ? "campaign" : fallbackKind);
            statement.setString(3, goalId);
            statement.executeUpdate();
        }
    }

    private UUID findPlayerId(Connection connection, String serverId, UUID mcUuid) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "select id from players where server_id = ? and mc_uuid = ?")) {
            statement.setString(1, serverId);
            statement.setString(2, mcUuid.toString());
            try (ResultSet rs = statement.executeQuery()) {
                return rs.next() ? uuid(rs, "id") : null;
            }
        }
    }

    private static void requireServer(String serverId) throws SQLException {
        if (serverId == null || serverId.isBlank()) {
            throw new SQLException("server-id je prázdne. Zápis do databázy je odmietnutý.");
        }
    }

    private static void ensureServer(Connection connection, String serverId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                insert into servers (id, label, first_seen_at)
                values (?, ?, now())
                on conflict (id) do nothing
                """)) {
            statement.setString(1, serverId);
            statement.setString(2, serverId);
            statement.executeUpdate();
        }
    }

    private static ExpeditionRecord readExpedition(ResultSet rs) throws SQLException {
        return new ExpeditionRecord(
                uuid(rs, "id"),
                rs.getString("slug"),
                rs.getString("title"),
                rs.getString("description"),
                rs.getString("status"),
                rs.getObject("starts_at", OffsetDateTime.class),
                rs.getObject("ends_at", OffsetDateTime.class)
        );
    }

    private static UUID uuid(ResultSet rs, String column) throws SQLException {
        Object value = rs.getObject(column);
        if (value instanceof UUID id) {
            return id;
        }
        return UUID.fromString(String.valueOf(value));
    }

    private static List<String> readTextArray(ResultSet rs, String column) throws SQLException {
        Array array = rs.getArray(column);
        if (array == null) {
            return List.of();
        }
        Object raw = array.getArray();
        if (raw instanceof String[] values) {
            return List.of(values);
        }
        if (raw instanceof Object[] values) {
            List<String> out = new ArrayList<>();
            for (Object value : values) {
                if (value != null) {
                    out.add(String.valueOf(value));
                }
            }
            return out;
        }
        return List.of();
    }

    private static Array textArray(Connection connection, List<String> values) throws SQLException {
        return connection.createArrayOf("text", values.toArray(String[]::new));
    }

    @Override
    public void close() {
        pool.close();
    }
}
