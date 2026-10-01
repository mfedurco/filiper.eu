package sk.vyprava.db;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Small YAML subset for the progress outbox: maps, lists, strings, ints, and booleans.
 */
public final class SimpleYaml {
    private SimpleYaml() {
    }

    public static String dump(Map<String, Object> document) {
        StringBuilder out = new StringBuilder();
        writeMap(out, document, 0);
        if (out.isEmpty()) {
            return "{}\n";
        }
        return out.toString();
    }

    public static Map<String, Object> parse(String text) {
        List<String> lines = List.of(text.split("\n", -1));
        int[] cursor = {0};
        Map<String, Object> document = parseMap(lines, 0, cursor);
        return document == null ? new LinkedHashMap<>() : document;
    }

    private static void writeMap(StringBuilder out, Map<String, Object> map, int indent) {
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            indent(out, indent);
            out.append(quote(entry.getKey())).append(':');
            writeValue(out, entry.getValue(), indent);
        }
    }

    private static void writeValue(StringBuilder out, Object value, int indent) {
        if (value instanceof Map<?, ?> map) {
            out.append('\n');
            @SuppressWarnings("unchecked")
            Map<String, Object> nested = (Map<String, Object>) map;
            if (nested.isEmpty()) {
                indent(out, indent + 1);
                out.append("{}\n");
                return;
            }
            writeMap(out, nested, indent + 1);
            return;
        }
        if (value instanceof List<?> list) {
            out.append('\n');
            if (list.isEmpty()) {
                indent(out, indent + 1);
                out.append("[]\n");
                return;
            }
            for (Object item : list) {
                indent(out, indent + 1);
                out.append("- ");
                if (item instanceof Map<?, ?> || item instanceof List<?>) {
                    throw new IllegalArgumentException("Vnorené zoznamy v outboxe nie sú podporované.");
                }
                out.append(scalar(item)).append('\n');
            }
            return;
        }
        out.append(' ').append(scalar(value)).append('\n');
    }

    private static String scalar(Object value) {
        if (value == null) {
            return "null";
        }
        if (value instanceof Boolean || value instanceof Integer || value instanceof Long) {
            return value.toString();
        }
        return quote(String.valueOf(value));
    }

    private static String quote(String value) {
        return '"' + value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r") + '"';
    }

    private static void indent(StringBuilder out, int level) {
        out.append("  ".repeat(Math.max(0, level)));
    }

    private static Map<String, Object> parseMap(List<String> lines, int indent, int[] cursor) {
        Map<String, Object> map = new LinkedHashMap<>();
        boolean any = false;
        while (cursor[0] < lines.size()) {
            String raw = lines.get(cursor[0]);
            if (raw.isBlank()) {
                cursor[0]++;
                continue;
            }
            int current = indentOf(raw);
            if (current < indent) {
                break;
            }
            if (current != indent) {
                throw new IllegalArgumentException("Neočakávané odsadenie YAML na riadku " + (cursor[0] + 1));
            }
            String trimmed = raw.trim();
            if (trimmed.startsWith("- ")) {
                break;
            }
            if ("{}".equals(trimmed)) {
                cursor[0]++;
                return map;
            }
            int colon = splitKey(trimmed);
            String key = unquote(trimmed.substring(0, colon).trim());
            String rest = trimmed.substring(colon + 1).trim();
            cursor[0]++;
            any = true;
            if (rest.isEmpty()) {
                map.put(key, parseNested(lines, indent, cursor));
            } else {
                map.put(key, parseScalar(rest));
            }
        }
        return any || indent == 0 ? map : null;
    }

    private static Object parseNested(List<String> lines, int indent, int[] cursor) {
        while (cursor[0] < lines.size() && lines.get(cursor[0]).isBlank()) {
            cursor[0]++;
        }
        if (cursor[0] >= lines.size()) {
            return new LinkedHashMap<String, Object>();
        }
        String next = lines.get(cursor[0]);
        int nextIndent = indentOf(next);
        if (nextIndent <= indent) {
            return new LinkedHashMap<String, Object>();
        }
        String trimmed = next.trim();
        if ("{}".equals(trimmed)) {
            cursor[0]++;
            return new LinkedHashMap<String, Object>();
        }
        if ("[]".equals(trimmed)) {
            cursor[0]++;
            return new ArrayList<>();
        }
        if (trimmed.startsWith("- ")) {
            return parseList(lines, nextIndent, cursor);
        }
        Map<String, Object> nested = parseMap(lines, nextIndent, cursor);
        return nested == null ? new LinkedHashMap<String, Object>() : nested;
    }

    private static List<Object> parseList(List<String> lines, int indent, int[] cursor) {
        List<Object> list = new ArrayList<>();
        while (cursor[0] < lines.size()) {
            String raw = lines.get(cursor[0]);
            if (raw.isBlank()) {
                cursor[0]++;
                continue;
            }
            int current = indentOf(raw);
            if (current < indent) {
                break;
            }
            String trimmed = raw.trim();
            if (!trimmed.startsWith("- ")) {
                break;
            }
            list.add(parseScalar(trimmed.substring(2).trim()));
            cursor[0]++;
        }
        return list;
    }

    private static Object parseScalar(String raw) {
        if (raw.equals("null") || raw.equals("~")) {
            return null;
        }
        if (raw.equals("true")) {
            return true;
        }
        if (raw.equals("false")) {
            return false;
        }
        if (raw.startsWith("\"")) {
            return unquote(raw);
        }
        if (raw.matches("-?\\d+")) {
            try {
                return Integer.valueOf(raw);
            } catch (NumberFormatException ignored) {
                return Long.valueOf(raw);
            }
        }
        return unquote(raw);
    }

    private static int splitKey(String trimmed) {
        boolean quoted = false;
        for (int i = 0; i < trimmed.length(); i++) {
            char c = trimmed.charAt(i);
            if (c == '"' && (i == 0 || trimmed.charAt(i - 1) != '\\')) {
                quoted = !quoted;
            } else if (c == ':' && !quoted) {
                return i;
            }
        }
        throw new IllegalArgumentException("YAML kľúč bez dvojbodky: " + trimmed);
    }

    private static int indentOf(String raw) {
        int indent = 0;
        while (indent < raw.length() && raw.charAt(indent) == ' ') {
            indent++;
        }
        if (indent % 2 != 0) {
            throw new IllegalArgumentException("YAML odsadenie musí byť násobkom dvoch.");
        }
        return indent / 2;
    }

    private static String unquote(String raw) {
        if (raw.length() >= 2 && raw.charAt(0) == '"' && raw.charAt(raw.length() - 1) == '"') {
            String body = raw.substring(1, raw.length() - 1);
            StringBuilder out = new StringBuilder();
            for (int i = 0; i < body.length(); i++) {
                char c = body.charAt(i);
                if (c == '\\' && i + 1 < body.length()) {
                    char next = body.charAt(++i);
                    out.append(switch (next) {
                        case 'n' -> '\n';
                        case 'r' -> '\r';
                        case '"' -> '"';
                        case '\\' -> '\\';
                        default -> next;
                    });
                } else {
                    out.append(c);
                }
            }
            return out.toString();
        }
        return raw;
    }
}
