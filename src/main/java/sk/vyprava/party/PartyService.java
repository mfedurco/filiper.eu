package sk.vyprava.party;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import sk.vyprava.lang.Speaker;
import sk.vyprava.model.PartyData;
import sk.vyprava.model.PlayerProgress;
import sk.vyprava.storage.ProgressStore;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public final class PartyService {
    private final ProgressStore store;
    private final Speaker speaker;

    public PartyService(ProgressStore store, Speaker speaker) {
        this.store = store;
        this.speaker = speaker;
    }

    public Optional<PartyData> findFor(UUID playerId) {
        PlayerProgress progress = store.getOrCreate(playerId, "Unknown");
        if (progress.partyId() == null) {
            return Optional.empty();
        }
        return store.party(progress.partyId());
    }

    public PartyData create(Player leader, String name) {
        findFor(leader.getUniqueId()).ifPresent(existing -> leave(leader));
        String id = "party_" + Integer.toHexString(name.toLowerCase().hashCode()) + "_" + (System.currentTimeMillis() % 10000);
        PartyData party = new PartyData(id, name, leader.getUniqueId());
        store.putParty(party);
        PlayerProgress progress = store.getOrCreate(leader.getUniqueId(), leader.getName());
        progress.setPartyId(id);
        return party;
    }

    public boolean invite(Player leader, Player target) {
        Optional<PartyData> opt = findFor(leader.getUniqueId());
        if (opt.isEmpty()) {
            return false;
        }
        PartyData party = opt.get();
        if (!party.leader().equals(leader.getUniqueId())) {
            return false;
        }
        if (party.members().size() >= 8) {
            return false;
        }
        findFor(target.getUniqueId()).ifPresent(p -> leave(target));
        party.members().add(target.getUniqueId());
        store.getOrCreate(target.getUniqueId(), target.getName()).setPartyId(party.id());
        return true;
    }

    public void leave(Player player) {
        Optional<PartyData> opt = findFor(player.getUniqueId());
        if (opt.isEmpty()) {
            return;
        }
        PartyData party = opt.get();
        party.members().remove(player.getUniqueId());
        store.getOrCreate(player.getUniqueId(), player.getName()).setPartyId(null);
        if (party.members().isEmpty()) {
            store.removeParty(party.id());
            return;
        }
        if (party.leader().equals(player.getUniqueId())) {
            UUID newLeader = party.members().iterator().next();
            party.setLeader(newLeader);
            Player online = Bukkit.getPlayer(newLeader);
            if (online != null) {
                speaker.tell(online, "party-new-leader", Map.of("party", party.name()));
            }
        }
    }
}
