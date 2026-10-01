import type { Metadata } from "next";
import Link from "next/link";
import { getLeaderboard } from "@/lib/data";
import { EmptyState, ErrorState, PageHero } from "@/components/ui";

export const metadata: Metadata = {
  title: "Rebríček",
};

export const dynamic = "force-dynamic";

export default async function RebricekPage() {
  let entries;
  try {
    entries = await getLeaderboard();
  } catch {
    return (
      <main className="pb-16 pt-8">
        <PageHero title="Rebríček" />
        <ErrorState description="Nepodarilo sa načítať leaderboard.json." />
      </main>
    );
  }

  const sorted = [...entries].sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <main className="pb-20 pt-8">
      <PageHero
        eyebrow="Kto vedie Výpravu?"
        title="Rebríček"
        description="Celkové a týždenné body zo kampane, denných a party úloh. Demo dáta – neskôr sa napoja na plugin cez NEXT_PUBLIC_VYPRVA_API_URL."
      >
        <Link href="/hrac" className="btn-secondary">
          Ukážkový hráč
        </Link>
      </PageHero>

      {!sorted.length ? (
        <EmptyState
          title="Rebríček je prázdny"
          description="Zatiaľ tu nie sú žiadni hráči."
        />
      ) : (
        <div className="section-shell overflow-hidden rounded-[1.25rem] surface-strong">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--line)] bg-[rgba(31,69,51,0.08)] text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold md:px-6">#</th>
                <th className="px-4 py-3 font-semibold md:px-6">Hráč</th>
                <th className="px-4 py-3 font-semibold md:px-6">Kapitola</th>
                <th className="px-4 py-3 font-semibold md:px-6">Týždeň</th>
                <th className="px-4 py-3 font-semibold md:px-6">Spolu</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, index) => (
                <tr
                  key={entry.name}
                  className="border-b border-[var(--line)] last:border-b-0"
                >
                  <td className="px-4 py-4 font-display text-lg text-pine-800 md:px-6">
                    {index + 1}
                  </td>
                  <td className="px-4 py-4 font-medium text-pine-950 md:px-6">
                    {entry.name}
                  </td>
                  <td className="px-4 py-4 text-ink-muted md:px-6">
                    {entry.chapter}
                  </td>
                  <td className="px-4 py-4 text-ink-muted md:px-6">
                    {entry.weeklyPoints}
                  </td>
                  <td className="px-4 py-4 font-display text-lg text-ember-500 md:px-6">
                    {entry.totalPoints}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
