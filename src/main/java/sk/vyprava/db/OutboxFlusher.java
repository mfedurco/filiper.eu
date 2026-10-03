package sk.vyprava.db;

public final class OutboxFlusher {
    @FunctionalInterface
    public interface Writer {
        void write(OutboxBatch batch) throws Exception;
    }

    public boolean flush(ProgressOutbox outbox, Writer writer) throws Exception {
        OutboxBatch batch = outbox.copyPending();
        if (batch.isEmpty()) {
            return true;
        }
        writer.write(batch);
        outbox.ack(batch);
        return true;
    }
}
