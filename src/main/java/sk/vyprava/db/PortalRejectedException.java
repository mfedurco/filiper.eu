package sk.vyprava.db;

public final class PortalRejectedException extends Exception {
    public PortalRejectedException() {
        super("Portal rejected the server key.");
    }
}
