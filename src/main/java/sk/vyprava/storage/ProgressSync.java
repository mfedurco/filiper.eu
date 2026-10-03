package sk.vyprava.storage;

import sk.vyprava.model.PartyData;
import sk.vyprava.model.PlayerProgress;
import sk.vyprava.model.SharedGoalData;

public interface ProgressSync {
    ProgressSync NOOP = new ProgressSync() {
    };

    default void onPlayer(PlayerProgress player) {
    }

    default void onShared(SharedGoalData goal) {
    }

    default void onParty(PartyData party) {
    }
}
