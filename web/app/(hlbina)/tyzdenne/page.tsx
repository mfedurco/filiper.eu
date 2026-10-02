import type { Metadata } from "next";
import Link from "next/link";
import { getWeeklyPool } from "@/lib/data";
import { PortalGap } from "@/components/portal-gap";
import { ErrorState, PageHero } from "@/components/ui";
import { QuestRow } from "@/components/quest-row";

export const metadata: Metadata = {
  title: "Týždenné úlohy",
};

export const dynamic = "force-dynamic";

export default async function TyzdennePage() {
  let weekly;
  try {
    weekly = await getWeeklyPool();
  } catch {
    return (
      <main className="pb-16 pt-8">
        <PageHero title="Týždenné úlohy" />
        <ErrorState description="Nepodarilo sa načítať týždenný pool." />
      </main>
    );
  }

  const pool = weekly.pool ?? [];

  return (
    <main className="pb-20 pt-8">
      <PageHero
        eyebrow={weekly.periodKey ? `Týždeň ${weekly.periodKey}` : "Každý týždeň"}
        title="Týždenné úlohy"
        description="Väčšie výzvy s lepšími odmenami. Plugin priraďuje 2 úlohy podľa odomknutej kapitoly a resetuje ich na začiatku týždňa."
      >
        <Link href="/dlhodobe" className="btn-secondary">
          Dlhodobé ciele
        </Link>
      </PageHero>

      {!pool.length ? (
        <PortalGap
          title="Týždenný pool je prázdny"
          description="Aktívna výprava nemá týždenné úlohy."
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
