import type { Metadata } from "next";
import Link from "next/link";
import { getLeaderboard } from "@/lib/data";
import { getPortalMeta } from "@/lib/portal";
import { PortalGap } from "@/components/portal-gap";
import { ErrorState, PageHero } from "@/components/ui";

export const metadata: Metadata = {
  title: "Rebríček",
};

export const dynamic = "force-dynamic";

export default async function RebricekPage() {
  let entries;
  let serverId = "";
  try {
    const [loaded, meta] = await Promise.all([getLeaderboard(), getPortalMeta()]);
    entries = loaded;
    serverId = meta.serverId;
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
        description="Celkové a týždenné body z kampane, denných, týždenných, dlhodobých a spoločných cieľov aktívnej výpravy."
      >
        <Link href="/hrac" className="btn-secondary">
          Hráči
        </Link>
      </PageHero>

      {!sorted.length ? (
        <PortalGap
          title="Rebríček je prázdny"
          description="Na tomto serveri zatiaľ nie sú hráči."
        />
      ) : (
        <div className="section-shell surface-strong overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-mist-muted">
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
                  key={entry.uuid || `${entry.name}-${index}`}
                  className="border-b border-[var(--line)] last:border-b-0"
                >
                  <td className="px-4 py-4 font-display text-lg text-moss-100 md:px-6">
                    {index + 1}
                  </td>
                  <td className="px-4 py-4 font-medium text-moss-50 md:px-6">
                    {entry.uuid ? (
                      <Link href={`/hrac/${serverId}/${entry.uuid}`} className="underline">
                        {entry.name}
                      </Link>
                    ) : (
                      entry.name
                    )}
                  </td>
                  <td className="px-4 py-4 text-mist-muted md:px-6">
                    {entry.chapter}
                  </td>
                  <td className="px-4 py-4 text-mist-muted md:px-6">
                    {entry.weeklyPoints}
                  </td>
                  <td className="px-4 py-4 font-display text-lg text-lantern md:px-6">
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
