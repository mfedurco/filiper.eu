import type { Metadata } from "next";
import Link from "next/link";
import { getSharedGoals } from "@/lib/data";
import { PortalGap } from "@/components/portal-gap";
import { ErrorState, PageHero, ProgressBar } from "@/components/ui";

export const metadata: Metadata = {
  title: "Spoločné ciele",
};

export const dynamic = "force-dynamic";

export default async function SpolocnePage() {
  let goals;
  try {
    goals = await getSharedGoals();
  } catch {
    return (
      <main className="pb-16 pt-8">
        <PageHero title="Spoločné ciele" />
        <ErrorState description="Nepodarilo sa načítať spoločné ciele." />
      </main>
    );
  }

  return (
    <main className="pb-20 pt-8">
      <PageHero
        eyebrow="Celý server spolu"
        title="Spoločné ciele"
        description="Postavte most, vyťažte železo, držte nočnú hliadku — každý príspevok sa počíta. Po splnení dostanú odmenu všetci prispievatelia."
      >
        <Link href="/rebricek" className="btn-secondary">
          Rebríček
        </Link>
      </PageHero>

      {!goals.length ? (
        <PortalGap
          title="Žiadne aktívne spoločné ciele"
          description="Aktívna výprava nemá spoločný cieľ."
        />
      ) : (
        <div className="section-shell space-y-10">
          {goals.map((goal) => {
            const pct = Math.min(100, Math.round((goal.progress / goal.amount) * 100));
            return (
              <article key={goal.id} className="surface-strong px-5 py-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lantern">
                      {goal.completed ? "Splnené" : `${goal.progress} / ${goal.amount}`}
                    </p>
                    <h2 className="font-display mt-2 text-3xl text-moss-50">{goal.name}</h2>
                    <p className="mt-2 max-w-2xl text-sm text-mist-muted">{goal.description}</p>
                  </div>
                  <p className="text-sm text-mist-muted">+{goal.points} bodov</p>
                </div>

                <ProgressBar className="mt-5" value={pct} />

                <div className="mt-6">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-mist-muted">
                    Príspevky hráčov
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {goal.contributions.length === 0 ? (
                      <li className="text-sm text-mist-muted">Zatiaľ bez príspevkov.</li>
                    ) : (
                      goal.contributions.map((c) => (
                        <li
                          key={`${goal.id}-${c.name}`}
                          className="flex items-center justify-between border-b border-[var(--line)] py-2 text-sm"
                        >
                          <span className="text-moss-50">{c.name}</span>
                          <span className="text-lantern">+{c.amount}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
