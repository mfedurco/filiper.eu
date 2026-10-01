package sk.vyprava.db;

public final class LogSafe {
    private LogSafe() {
    }

    public static String message(Throwable error) {
        String text = error == null ? "" : error.getMessage();
        if (text == null || text.isBlank()) {
            text = error == null ? "" : error.getClass().getSimpleName();
        }
        return redact(text);
    }

    public static String redact(String text) {
        if (text == null || text.isBlank()) {
            return "";
        }
        return text
                .replaceAll("(?i)jdbc:postgresql://\\S+", "[redacted-url]")
                .replaceAll("(?i)postgres(?:ql)?://\\S+", "[redacted-url]")
                .replaceAll("(?i)(password|pwd)=[^&\\s'\"]+", "$1=[redacted]")
                .replaceAll("(?i)[a-z0-9.-]*neon\\.tech\\S*", "[redacted-host]")
                .replaceAll("(?i)\\bep-[a-z0-9-]+\\b", "[redacted-host]");
    }
}
