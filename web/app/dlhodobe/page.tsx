import type { Metadata } from "next";
import Link from "next/link";
import { getLongTermPool } from "@/lib/data";
import { EmptyState, ErrorState, PageHero } from "@/components/ui";
import { QuestRow } from "@/components/quest-row";

export const metadata: Metadata = {
  title: "Dlhodobé ciele",
};

export const dynamic = "force-dynamic";

export default async function DlhodobePage() {
  let longterm;
  try {
    longterm = await getLongTermPool();
  } catch {
    return (
      <main className="pb-16 pt-8">
        <PageHero title="Dlhodobé ciele" />
        <ErrorState description="Nepodarilo sa načítať dlhodobé ciele." />
      </main>
    );
  }

  const pool = longterm.pool ?? [];

  return (
    <main className="pb-20 pt-8">
      <PageHero
        eyebrow={longterm.periodKey ? `Sezóna ${longterm.periodKey}` : "Sezónne výzvy"}
        title="Dlhodobé ciele"
        description="Sezónne míľniky pre vytrvalých prieskumníkov. Trvajú celú sezónu a prinášajú vzácne odmeny."
      >
        <Link href="/spolocne" className="btn-secondary">
          Spoločné ciele
        </Link>
      </PageHero>

      {!pool.length ? (
        <EmptyState
          title="Žiadne dlhodobé ciele"
          description="Pridaj sezónne ciele v admine alebo cez Supabase seed."
        />
      ) : (
        <div className="section-shell surface-strong px-6 md:px-8">
          {pool
            .slice()
            .sort((a, b) => (a.minChapter ?? 1) - (b.minChapter ?? 1))
            .map((quest) => (
              <QuestRow key={quest.id} quest={quest} showMinChapter />
            ))}
        </div>
      )}
    </main>
  );
}
