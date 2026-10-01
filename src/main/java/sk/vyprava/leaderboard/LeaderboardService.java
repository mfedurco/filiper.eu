package sk.vyprava.leaderboard;

import sk.vyprava.model.PlayerProgress;
import sk.vyprava.storage.ProgressStore;

import java.util.Comparator;
import java.util.List;

public final class LeaderboardService {
    private final ProgressStore store;

    public LeaderboardService(ProgressStore store) {
        this.store = store;
    }

    public List<PlayerProgress> topTotal(int limit) {
        return store.allPlayers().values().stream()
                .sorted(Comparator.comparingInt(PlayerProgress::totalPoints).reversed())
                .limit(limit)
                .toList();
    }

    public List<PlayerProgress> topWeekly(int limit) {
        return store.allPlayers().values().stream()
                .sorted(Comparator.comparingInt(PlayerProgress::weeklyPoints).reversed())
                .limit(limit)
                .toList();
    }
}
