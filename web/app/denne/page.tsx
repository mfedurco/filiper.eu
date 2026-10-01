import type { Metadata } from "next";
import Link from "next/link";
import { getDailyPool } from "@/lib/data";
import { EmptyState, ErrorState, PageHero } from "@/components/ui";
import { QuestRow } from "@/components/quest-row";

export const metadata: Metadata = {
  title: "Denné úlohy",
};

export const dynamic = "force-dynamic";

export default async function DennePage() {
  let daily;
  try {
    daily = await getDailyPool();
  } catch {
    return (
      <main className="pb-16 pt-8">
        <PageHero title="Denné úlohy" />
        <ErrorState description="Nepodarilo sa načítať denný pool." />
      </main>
    );
  }

  const pool = daily.pool ?? [];

  return (
    <main className="pb-20 pt-8">
      <PageHero
        eyebrow="Každý deň nové výzvy"
        title="Denné úlohy"
        description="Každému hráčovi sa náhodne priradia 3 úlohy z poolu podľa odomknutej kapitoly. Plugin resetuje pool o polnoci (Europe/Bratislava)."
      >
        <Link href="/party" className="btn-secondary">
          Pozri party úlohy
        </Link>
      </PageHero>

      {!pool.length ? (
        <EmptyState
          title="Denný pool je prázdny"
          description="V admine pridaj denné úlohy do data/quests/daily.json."
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
