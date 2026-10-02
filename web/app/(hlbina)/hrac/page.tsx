import type { Metadata } from "next";
import Link from "next/link";
import { getCampaign, getLivePlayers } from "@/lib/data";
import { PortalGap } from "@/components/portal-gap";
import { ErrorState, PageHero, ProgressBar } from "@/components/ui";
import { QuestRow } from "@/components/quest-row";
import { getPortalMeta, type PortalMeta } from "@/lib/portal";
import type { Campaign, PlayerProgress } from "@/lib/types";
import { clampPercent } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Hráčsky postup",
};

export const dynamic = "force-dynamic";

export default async function HracPage({
  searchParams,
}: {
  searchParams: Promise<{ hrac?: string }>;
}) {
  const query = await searchParams;
  let players: PlayerProgress[];
  let campaign: Campaign;
  let meta: PortalMeta;
  try {
    [players, campaign, meta] = await Promise.all([
      getLivePlayers(),
      getCampaign(),
      getPortalMeta(),
    ]);
  } catch {
    return (
      <main className="pb-16 pt-8">
        <PageHero title="Hráčsky postup" />
        <ErrorState description="Nepodarilo sa načítať hráčov." />
      </main>
    );
  }

  if (!players.length) {
    return (
      <main className="pb-16 pt-8">
        <PageHero title="Hráčsky postup" />
        <PortalGap
          title="Žiadny hráč"
          description="Na tomto serveri zatiaľ nikto nehral."
        />
      </main>
    );
  }

  const requested = query.hrac?.trim();
  const progress =
    players.find((player) => player.playerName === requested) ?? players[0];
  const chapter = campaign.chapters.find((item) => item.order === progress.currentChapter);
  const completed = new Set(progress.completedQuests);

  function playerHref(name: string) {
    const params = new URLSearchParams();
    if (meta.serverId !== "test") params.set("server", meta.serverId);
    params.set("hrac", name);
    return `/hrac?${params.toString()}`;
  }

  return (
    <main className="pb-20 pt-8">
      <PageHero
        eyebrow={meta.expedition?.title ?? meta.serverId}
        title={progress.playerName}
        description={
          meta.expedition
            ? `Kapitola ${progress.currentChapter}: ${progress.chapterName}. Celkom ${progress.totalPoints} bodov · tento týždeň ${progress.weeklyPoints}.`
            : `Celkom ${progress.totalPoints} bodov. Tento server nemá aktívnu výpravu, preto tu nie je postup úloh.`
        }
      >
        <div className="flex flex-wrap gap-2">
          {players.map((player) => (
            <Link
              key={player.playerName}
              href={playerHref(player.playerName)}
              className="chip"
              aria-current={player.playerName === progress.playerName ? "page" : undefined}
            >
              {player.playerName}
            </Link>
          ))}
        </div>
      </PageHero>

      <div className="section-shell grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="surface-strong px-6 py-6 md:px-8">
          <h2 className="font-display text-2xl text-pine-950">Aktuálna kapitola</h2>
          {!chapter ? (
            <p className="mt-3 text-ink-muted">Kapitola sa v aktívnej výprave nenašla.</p>
          ) : (
            <div className="mt-2">
              {chapter.quests.map((quest) => {
                const done = completed.has(quest.id);
                const live = progress.questProgress[quest.id];
                return (
                  <QuestRow
                    key={quest.id}
                    quest={quest}
                    progress={{
                      current: done ? quest.amount : (live?.current ?? 0),
                      target: quest.amount,
                      completed: done,
                    }}
                  />
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <ProgressList title="Denné dnes" items={progress.dailyQuests} />
          <ProgressList title="Týždenné" items={progress.weeklyQuests ?? []} />
          <ProgressList title="Dlhodobé" items={progress.longTermQuests ?? []} />

          {progress.partyQuest ? (
            <section className="surface-strong px-6 py-6">
              <p className="badge mb-3">{progress.partyQuest.partyName}</p>
              <h2 className="font-display text-xl text-pine-950">{progress.partyQuest.name}</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {progress.partyQuest.current}/{progress.partyQuest.target}
              </p>
              <ProgressBar
                className="mt-3"
                value={clampPercent(progress.partyQuest.current, progress.partyQuest.target)}
              />
            </section>
          ) : null}

          <section className="surface-strong px-6 py-6">
            <h2 className="font-display text-xl text-pine-950">Milníky</h2>
            {progress.completedMilestones.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">Zatiaľ žiadny dokončený milník.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-ink-muted">
                {progress.completedMilestones.map((id) => (
                  <li key={id} className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 bg-[var(--accent)]" />
                    {id.replace("chapter_", "Kapitola ")}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

function ProgressList({
  title,
  items,
}: {
  title: string;
  items: { id: string; name: string; current: number; target: number }[];
}) {
  if (!items.length) return null;
  return (
    <section className="surface-strong px-6 py-6">
      <h2 className="font-display text-xl text-pine-950">{title}</h2>
      <div className="mt-4 space-y-4">
        {items.map((quest) => (
          <div key={quest.id}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="font-medium text-pine-900">{quest.name}</p>
              <span className="text-xs text-ink-muted">
                {quest.current}/{quest.target}
              </span>
            </div>
            <ProgressBar value={clampPercent(quest.current, quest.target)} />
          </div>
        ))}
      </div>
    </section>
  );
}
