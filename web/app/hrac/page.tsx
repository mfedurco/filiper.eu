import type { Metadata } from "next";
import Link from "next/link";
import { getCampaign, getProgressDemo } from "@/lib/data";
import { EmptyState, ErrorState, PageHero, ProgressBar } from "@/components/ui";
import { QuestRow } from "@/components/quest-row";
import { clampPercent } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Hráčsky postup",
};

export const dynamic = "force-dynamic";

export default async function HracPage() {
  let progress;
  let campaign;
  try {
    [progress, campaign] = await Promise.all([
      getProgressDemo(),
      getCampaign(),
    ]);
  } catch {
    return (
      <main className="pb-16 pt-8">
        <PageHero title="Hráčsky postup" />
        <ErrorState description="Nepodarilo sa načítať demo progress." />
      </main>
    );
  }

  if (!progress) {
    return (
      <main className="pb-16 pt-8">
        <PageHero title="Hráčsky postup" />
        <EmptyState
          title="Žiadny demo hráč"
          description="Chýba progress-demo.json."
        />
      </main>
    );
  }

  const chapter = campaign.chapters.find(
    (c) => c.order === progress.currentChapter,
  );
  const completed = new Set(progress.completedQuests);

  return (
    <main className="pb-20 pt-8">
      <PageHero
        eyebrow="Demo hráč"
        title={progress.playerName}
        description={`Kapitola ${progress.currentChapter}: ${progress.chapterName}. Celkom ${progress.totalPoints} bodov · tento týždeň ${progress.weeklyPoints}.`}
      >
        <Link href="/rebricek" className="btn-secondary">
          Späť na rebríček
        </Link>
      </PageHero>

      <div className="section-shell grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="surface-strong px-6 py-6 md:px-8">
          <h2 className="font-display text-2xl text-pine-950">
            Aktuálna kapitola
          </h2>
          {!chapter ? (
            <p className="mt-3 text-ink-muted">Kapitola sa nenašla v kampani.</p>
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
                      current: done
                        ? quest.amount
                        : (live?.current ?? 0),
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
          <section className="surface-strong px-6 py-6">
            <h2 className="font-display text-xl text-pine-950">Denné dnes</h2>
            <div className="mt-4 space-y-4">
              {progress.dailyQuests.map((q) => {
                const percent = clampPercent(q.current, q.target);
                return (
                  <div key={q.id}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="font-medium text-pine-900">{q.name}</p>
                      <span className="text-xs text-ink-muted">
                        {q.current}/{q.target}
                      </span>
                    </div>
                    <ProgressBar value={percent} />
                  </div>
                );
              })}
            </div>
          </section>

          {progress.partyQuest ? (
            <section className="surface-strong px-6 py-6">
              <p className="badge mb-3">{progress.partyQuest.partyName}</p>
              <h2 className="font-display text-xl text-pine-950">
                {progress.partyQuest.name}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {progress.partyQuest.current}/{progress.partyQuest.target}
              </p>
              <ProgressBar
                className="mt-3"
                value={clampPercent(
                  progress.partyQuest.current,
                  progress.partyQuest.target,
                )}
              />
            </section>
          ) : null}

          <section className="surface-strong px-6 py-6">
            <h2 className="font-display text-xl text-pine-950">Milníky</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-muted">
              {progress.completedMilestones.map((id) => (
                <li key={id} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 bg-[var(--accent)]" />
                  {id.replace("chapter_", "Kapitola ")}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
