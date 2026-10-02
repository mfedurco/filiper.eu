package sk.vyprava.db;

import java.util.ArrayList;
import java.util.List;

public final class SqlScripts {
    private SqlScripts() {
    }

    public static List<String> split(String sql) {
        List<String> statements = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int i = 0;
        while (i < sql.length()) {
            char c = sql.charAt(i);
            if (c == '-' && i + 1 < sql.length() && sql.charAt(i + 1) == '-') {
                int newline = sql.indexOf('\n', i);
                i = newline < 0 ? sql.length() : newline + 1;
                current.append('\n');
                continue;
            }
            if (c == '\'') {
                i = appendQuoted(sql, current, i);
                continue;
            }
            if (c == '$') {
                String tag = dollarTag(sql, i);
                if (tag != null) {
                    int close = sql.indexOf(tag, i + tag.length());
                    if (close < 0) {
                        throw new IllegalArgumentException("Unclosed dollar quote in the SQL script.");
                    }
                    current.append(sql, i, close + tag.length());
                    i = close + tag.length();
                    continue;
                }
            }
            if (c == ';') {
                push(statements, current);
                i++;
                continue;
            }
            current.append(c);
            i++;
        }
        push(statements, current);
        return statements;
    }

    private static void push(List<String> statements, StringBuilder current) {
        String statement = current.toString().trim();
        current.setLength(0);
        if (!statement.isEmpty()) {
            statements.add(statement);
        }
    }

    private static int appendQuoted(String sql, StringBuilder current, int start) {
        current.append('\'');
        int i = start + 1;
        while (i < sql.length()) {
            char c = sql.charAt(i);
            current.append(c);
            if (c == '\'') {
                if (i + 1 < sql.length() && sql.charAt(i + 1) == '\'') {
                    current.append('\'');
                    i += 2;
                    continue;
                }
                return i + 1;
            }
            i++;
        }
        throw new IllegalArgumentException("Unclosed string in the SQL script.");
    }

    private static String dollarTag(String sql, int start) {
        int j = start + 1;
        while (j < sql.length()) {
            char c = sql.charAt(j);
            if (!(Character.isLetterOrDigit(c) || c == '_')) {
                break;
            }
            j++;
        }
        if (j < sql.length() && sql.charAt(j) == '$') {
            return sql.substring(start, j + 1);
        }
        return null;
    }
}
