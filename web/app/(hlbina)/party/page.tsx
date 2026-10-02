import type { Metadata } from "next";
import Link from "next/link";
import { getPartyPool } from "@/lib/data";
import { PortalGap } from "@/components/portal-gap";
import { ErrorState, PageHero } from "@/components/ui";
import { QuestRow } from "@/components/quest-row";

export const metadata: Metadata = {
  title: "Party úlohy",
};

export const dynamic = "force-dynamic";

export default async function PartyPage() {
  let party;
  try {
    party = await getPartyPool();
  } catch {
    return (
      <main className="pb-16 pt-8">
        <PageHero title="Party úlohy" />
        <ErrorState description="Nepodarilo sa načítať party pool." />
      </main>
    );
  }

  const pool = party.pool ?? [];

  return (
    <main className="pb-20 pt-8">
      <PageHero
        eyebrow="Spoločne to ide ľahšie"
        title="Party úlohy"
        description="Progress sa sčíta za celú partu. Ideálne na triedne výpravy – baníctvo, nočné hliadky aj spoločný drak."
      >
        <Link href="/denne" className="btn-secondary">
          Späť na denné
        </Link>
      </PageHero>

      {!pool.length ? (
        <PortalGap
          title="Party pool je prázdny"
          description="Aktívna výprava nemá party úlohy."
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
