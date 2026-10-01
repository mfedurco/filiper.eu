import type { Metadata } from "next";
import { getCampaign } from "@/lib/data";
import { EmptyState, ErrorState, PageHero } from "@/components/ui";
import { QuestRow, RewardList } from "@/components/quest-row";

export const metadata: Metadata = {
  title: "Kampaň",
};

export const dynamic = "force-dynamic";

export default async function KampanPage() {
  let campaign;
  try {
    campaign = await getCampaign();
  } catch {
    return (
      <main className="pb-16 pt-8">
        <PageHero
          eyebrow="Cesta Preživších"
          title="Kampaň"
          description="Roadmapa ôsmich kapitol survival výpravy."
        />
        <ErrorState description="Nepodarilo sa načítať campaign.json." />
      </main>
    );
  }

  if (!campaign.chapters?.length) {
    return (
      <main className="pb-16 pt-8">
        <PageHero title="Kampaň" description="Zatiaľ tu nie sú žiadne kapitoly." />
        <EmptyState
          title="Prázdna kampaň"
          description="V admine pridaj kapitoly a ulož ich do data/quests/campaign.json."
        />
      </main>
    );
  }

  return (
    <main className="pb-20 pt-8">
      <PageHero
        eyebrow={campaign.title}
        title="Kampaň"
        description="Postupuj kapitolami po poradí. Splň úlohy, získaj body a odomkni milník so vzácnou odmenou."
      />

      <div className="section-shell space-y-8">
        {campaign.chapters.map((chapter, index) => (
          <section
            key={chapter.id}
            className="surface-strong overflow-hidden"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <div className="border-b border-[var(--line)] px-6 py-6 md:px-8">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pine-700">
                    Kapitola {chapter.order}
                  </p>
                  <h2 className="font-display mt-1 text-3xl text-pine-950">
                    {chapter.name}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-ink-muted">
                    {chapter.description}
                  </p>
                </div>
                <p className="text-sm text-ink-muted">
                  {chapter.quests.length} úloh
                </p>
              </div>
            </div>

            <div className="px-6 md:px-8">
              {chapter.quests.map((quest) => (
                <QuestRow key={quest.id} quest={quest} />
              ))}
            </div>

            <div className="milestone-band px-6 py-6 md:px-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="badge-ember badge mb-2">Milník</p>
                  <h3 className="font-display text-2xl text-pine-950">
                    {chapter.milestone.name}
                  </h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    Odmena po dokončení všetkých úloh kapitoly
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl text-ember-500">
                    +{chapter.milestone.points}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-ink-muted">
                    bodov
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <RewardList rewards={chapter.milestone.rewards} />
              </div>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
