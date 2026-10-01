package sk.vyprava.smoke;

import sk.vyprava.db.DatabaseClient;
import sk.vyprava.db.DatabaseSettings;
import sk.vyprava.db.LogSafe;
import sk.vyprava.db.OutboxBatch;
import sk.vyprava.db.OutboxFlusher;
import sk.vyprava.db.PlayerSnapshot;
import sk.vyprava.db.ProgressOutbox;
import sk.vyprava.db.QuestRow;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

public final class NeonSmoke {
    private static final UUID TEST_UUID = UUID.fromString("00000000-0000-0000-0000-0000000000db");
    private static final String TEST_NAME = "db-test";

    public static void main(String[] args) {
        boolean ok = true;
        ok &= outboxRetry();
        String url = loadUrl();
        if (url == null || url.isBlank()) {
            System.out.println("NEON_WRITE=fail");
            System.out.println("error=DATABASE_URL_UNPOOLED missing");
            System.exit(1);
        }
        try {
            Class.forName("org.postgresql.Driver");
            try (DatabaseClient client = DatabaseClient.open(url)) {
                client.ping();
                String sql = Files.readString(Path.of("web/neon/002_expeditions.sql"));
                client.applyScript(sql);
                client.ping();
            }
            boolean wrote = playerRoundTrip(url) && progressPush(url);
            System.out.println(wrote ? "NEON_WRITE=pass" : "NEON_WRITE=fail");
            ok &= wrote;
            try (DatabaseClient client = DatabaseClient.open(url)) {
                var active = client.loadActive();
                int quests = client.countActiveQuests();
                if (active.isEmpty()) {
                    System.out.println("ACTIVE_SLUG=");
                    System.out.println("QUEST_COUNT=0");
                    ok = false;
                } else {
                    System.out.println("ACTIVE_SLUG=" + active.get().slug());
                    System.out.println("QUEST_COUNT=" + quests);
                    if (quests <= 0) {
                        ok = false;
                    }
                }
            }
            ok &= windowSwitch(url);
        } catch (Exception e) {
            System.out.println("NEON_WRITE=fail");
            printSafe(e);
            ok = false;
        }
        if (!ok) {
            System.exit(1);
        }
    }

    private static boolean outboxRetry() {
        try {
            Path file = Files.createTempDirectory("vyprava-outbox").resolve("outbox.yml");
            ProgressOutbox outbox = new ProgressOutbox();
            String expeditionId = "22222222-2222-2222-2222-222222222201";
            outbox.markPlayer(expeditionId, sample(TEST_UUID));
            outbox.save(file);

            ProgressOutbox reloaded = new ProgressOutbox();
            reloaded.load(file);
            if (!reloaded.hasPending()) {
                System.out.println("OUTBOX_RETRY=fail");
                System.out.println("error=pending flag missing after reload");
                return false;
            }
            AtomicInteger attempts = new AtomicInteger();
            OutboxFlusher flusher = new OutboxFlusher();
            try {
                flusher.flush(reloaded, batch -> {
                    attempts.incrementAndGet();
                    throw new IllegalStateException("database down");
                });
                System.out.println("OUTBOX_RETRY=fail");
                System.out.println("error=failed push cleared the queue");
                return false;
            } catch (Exception expected) {
                if (!reloaded.hasPending()) {
                    System.out.println("OUTBOX_RETRY=fail");
                    System.out.println("error=pending flag cleared after a failed push");
                    return false;
                }
            }
            reloaded.save(file);
            ProgressOutbox retry = new ProgressOutbox();
            retry.load(file);
            flusher.flush(retry, batch -> attempts.incrementAndGet());
            if (retry.hasPending() || attempts.get() != 2) {
                System.out.println("OUTBOX_RETRY=fail");
                System.out.println("error=retry did not clear pending");
                return false;
            }
            retry.save(file);
            ProgressOutbox done = new ProgressOutbox();
            done.load(file);
            if (done.hasPending()) {
                System.out.println("OUTBOX_RETRY=fail");
                System.out.println("error=pending flag still set on disk");
                return false;
            }
            System.out.println("OUTBOX_RETRY=pass");
            return true;
        } catch (Exception e) {
            System.out.println("OUTBOX_RETRY=fail");
            printSafe(e);
            return false;
        }
    }

    private static boolean playerRoundTrip(String url) {
        try (Connection connection = DatabaseClient.connect(url)) {
            deleteTestPlayer(connection);
            try (PreparedStatement insert = connection.prepareStatement("""
                    insert into players (mc_uuid, name, chapter, total_points, weekly_points)
                    values (?, ?, 1, 0, 0)
                    on conflict (mc_uuid) do update set name = excluded.name
                    """)) {
                insert.setString(1, TEST_UUID.toString());
                insert.setString(2, TEST_NAME);
                insert.executeUpdate();
            }
            String name;
            String uuid;
            try (PreparedStatement read = connection.prepareStatement(
                    "select name, mc_uuid from players where mc_uuid = ?")) {
                read.setString(1, TEST_UUID.toString());
                try (ResultSet rs = read.executeQuery()) {
                    if (!rs.next()) {
                        System.out.println("NEON_WRITE=fail");
                        System.out.println("error=test player missing after upsert");
                        return false;
                    }
                    name = rs.getString("name");
                    uuid = rs.getString("mc_uuid");
                }
            }
            deleteTestPlayer(connection);
            try (PreparedStatement read = connection.prepareStatement(
                    "select 1 from players where mc_uuid = ?")) {
                read.setString(1, TEST_UUID.toString());
                try (ResultSet rs = read.executeQuery()) {
                    if (rs.next()) {
                        System.out.println("NEON_WRITE=fail");
                        System.out.println("error=test player still present after delete");
                        return false;
                    }
                }
            }
            if (!TEST_NAME.equals(name) || !TEST_UUID.toString().equals(uuid)) {
                System.out.println("NEON_WRITE=fail");
                System.out.println("error=readback mismatch");
                return false;
            }
            return true;
        } catch (Exception e) {
            System.out.println("NEON_WRITE=fail");
            printSafe(e);
            try (Connection connection = DatabaseClient.connect(url)) {
                deleteTestPlayer(connection);
            } catch (Exception ignored) {
                // The cleanup error is not useful if it would include a URL.
            }
            return false;
        }
    }

    private static boolean progressPush(String url) {
        try (DatabaseClient client = DatabaseClient.open(url)) {
            var active = client.loadActive();
            if (active.isEmpty()) {
                System.out.println("NEON_WRITE=fail");
                System.out.println("error=no active expedition for progress push");
                return false;
            }
            client.push(new OutboxBatch(
                    java.util.List.of(new OutboxBatch.PlayerPush(active.get().id().toString(), sample(TEST_UUID))),
                    java.util.List.of(),
                    java.util.List.of()
            ), java.util.Map.of());
            try (Connection connection = DatabaseClient.connect(url)) {
                try (PreparedStatement read = connection.prepareStatement("""
                        select pp.current_amount
                        from player_progress pp
                        join players p on p.id = pp.player_id
                        where p.mc_uuid = ? and p.name = ? and pp.goal_id = 'c1_wood'
                        """)) {
                    read.setString(1, TEST_UUID.toString());
                    read.setString(2, TEST_NAME);
                    try (ResultSet rs = read.executeQuery()) {
                        if (!rs.next() || rs.getInt(1) != 1) {
                            System.out.println("NEON_WRITE=fail");
                            System.out.println("error=progress row missing after push");
                            return false;
                        }
                    }
                } finally {
                    deleteTestPlayer(connection);
                }
            }
            return true;
        } catch (Exception e) {
            System.out.println("NEON_WRITE=fail");
            printSafe(e);
            try (Connection connection = DatabaseClient.connect(url)) {
                deleteTestPlayer(connection);
            } catch (Exception ignored) {
                // Cleanup must not echo the connection string.
            }
            return false;
        }
    }

    private static boolean windowSwitch(String url) {
        try (Connection connection = DatabaseClient.connect(url)) {
            try (Statement statement = connection.createStatement()) {
                statement.executeUpdate("delete from expeditions where slug = 'window-smoke'");
            }
            String before;
            try (Statement statement = connection.createStatement();
                 ResultSet rs = statement.executeQuery(
                         "select slug from expeditions where status = 'active' limit 1")) {
                if (!rs.next()) {
                    System.out.println("WINDOW_SWITCH=fail");
                    System.out.println("error=no active expedition before the schedule test");
                    return false;
                }
                before = rs.getString(1);
            }
            connection.setAutoCommit(false);
            try {
                try (PreparedStatement insert = connection.prepareStatement("""
                        insert into expeditions (slug, title, description, status, starts_at, ends_at)
                        values ('window-smoke', 'Window smoke', 'rollback only', 'draft', ?, ?)
                        """)) {
                    insert.setObject(1, OffsetDateTime.parse("2027-07-01T00:00:00+02:00"));
                    insert.setObject(2, OffsetDateTime.parse("2027-08-01T00:00:00+02:00"));
                    insert.executeUpdate();
                }
                String active;
                String ended;
                boolean changed;
                try (PreparedStatement schedule = connection.prepareStatement(
                        "select changed, active_slug, ended_slug from apply_expedition_schedule(?)")) {
                    schedule.setObject(1, OffsetDateTime.parse("2027-07-15T12:00:00+02:00"));
                    try (ResultSet rs = schedule.executeQuery()) {
                        if (!rs.next()) {
                            System.out.println("WINDOW_SWITCH=fail");
                            System.out.println("error=schedule function returned no row");
                            return false;
                        }
                        changed = rs.getBoolean("changed");
                        active = rs.getString("active_slug");
                        ended = rs.getString("ended_slug");
                    }
                }
                if (!changed || !"window-smoke".equals(active) || ended == null || !ended.contains(before)) {
                    System.out.println("WINDOW_SWITCH=fail");
                    System.out.println("error=future window did not take over");
                    return false;
                }
            } finally {
                connection.rollback();
                connection.setAutoCommit(true);
            }
            try (Statement statement = connection.createStatement();
                 ResultSet rs = statement.executeQuery(
                         "select slug from expeditions where status = 'active' limit 1")) {
                if (!rs.next() || !before.equals(rs.getString(1))) {
                    System.out.println("WINDOW_SWITCH=fail");
                    System.out.println("error=rollback did not restore the active expedition");
                    return false;
                }
            }
            try (Statement statement = connection.createStatement();
                 ResultSet rs = statement.executeQuery(
                         "select count(*) from expeditions where slug = 'window-smoke'")) {
                if (!rs.next() || rs.getInt(1) != 0) {
                    System.out.println("WINDOW_SWITCH=fail");
                    System.out.println("error=schedule test row was committed");
                    return false;
                }
            }
            System.out.println("WINDOW_SWITCH=pass");
            return true;
        } catch (Exception e) {
            System.out.println("WINDOW_SWITCH=fail");
            printSafe(e);
            return false;
        }
    }

    private static void deleteTestPlayer(Connection connection) throws SQLException {
        try (PreparedStatement delete = connection.prepareStatement(
                "delete from players where mc_uuid = ? and name = ?")) {
            delete.setString(1, TEST_UUID.toString());
            delete.setString(2, TEST_NAME);
            delete.executeUpdate();
        }
    }

    private static PlayerSnapshot sample(UUID uuid) {
        return new PlayerSnapshot(
                uuid,
                TEST_NAME,
                1,
                0,
                0,
                null,
                "",
                "",
                "",
                0,
                true,
                Map.of("c1_wood", new QuestRow("campaign", 1, false)),
                Set.of(),
                Set.of(),
                Set.of(),
                Set.of(),
                Set.of(),
                Set.of(),
                Set.of(),
                Set.of()
        );
    }

    private static String loadUrl() {
        String env = System.getenv("DATABASE_URL_UNPOOLED");
        if (env != null && !env.isBlank()) {
            return env.trim();
        }
        for (Path path : java.util.List.of(
                Path.of("/workspace/.env.local"),
                Path.of(".env.local"),
                Path.of("../.env.local")
        )) {
            String value = DatabaseSettings.readKey(path, "DATABASE_URL_UNPOOLED");
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static void printSafe(Throwable error) {
        Throwable current = error;
        while (current != null) {
            System.out.println("error=" + LogSafe.message(current));
            if (current instanceof SQLException sql && sql.getSQLState() != null) {
                System.out.println("sqlstate=" + sql.getSQLState());
            }
            Throwable next = current.getCause();
            current = next == current ? null : next;
        }
    }
}
