package sk.vyprava.db;

import java.util.concurrent.TimeUnit;

public final class PortalHeartbeat {
    static final long INTERVAL_MILLIS = TimeUnit.MINUTES.toMillis(1);
    static final long INITIAL_RETRY_MILLIS = TimeUnit.SECONDS.toMillis(10);
    static final long MAX_RETRY_MILLIS = TimeUnit.MINUTES.toMillis(5);

    @FunctionalInterface
    public interface Sender {
        void send() throws Exception;
    }

    private long nextAttemptAt;
    private long retryDelayMillis = INITIAL_RETRY_MILLIS;

    public synchronized boolean run(long now, Sender sender) throws Exception {
        if (now < nextAttemptAt) {
            return false;
        }
        try {
            sender.send();
            nextAttemptAt = now + INTERVAL_MILLIS;
            retryDelayMillis = INITIAL_RETRY_MILLIS;
            return true;
        } catch (Exception error) {
            nextAttemptAt = now + retryDelayMillis;
            retryDelayMillis = Math.min(MAX_RETRY_MILLIS, retryDelayMillis * 2);
            throw error;
        }
    }

    long nextAttemptAt() {
        return nextAttemptAt;
    }

    long retryDelayMillis() {
        return retryDelayMillis;
    }
}
