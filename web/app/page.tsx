import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <section className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
        >
          <div className="animate-drift absolute -left-20 top-16 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(42,90,66,0.35),transparent_70%)] blur-2xl" />
          <div className="animate-soft-pulse absolute right-[-4rem] top-28 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(217,119,44,0.28),transparent_70%)] blur-2xl" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[rgba(15,31,23,0.18)] to-transparent" />
          <svg
            className="absolute bottom-0 left-0 right-0 h-40 w-full text-pine-900/25"
            viewBox="0 0 1440 180"
            preserveAspectRatio="none"
          >
            <path
              fill="currentColor"
              d="M0,120 L80,95 L160,130 L240,70 L320,110 L400,40 L480,100 L560,55 L640,115 L720,30 L800,90 L880,50 L960,120 L1040,45 L1120,95 L1200,60 L1280,110 L1360,75 L1440,100 L1440,180 L0,180 Z"
            />
          </svg>
        </div>

        <div className="section-shell relative flex min-h-[calc(100vh-3.5rem)] flex-col justify-center py-16">
          <p className="animate-fade-up mb-4 text-sm font-semibold uppercase tracking-[0.22em] text-pine-700">
            Survival questy · triedny server
          </p>
          <h1 className="font-display animate-fade-up max-w-4xl text-6xl font-semibold leading-[0.95] tracking-tight text-pine-950 md:text-8xl">
            Výprava
          </h1>
          <p className="mt-6 max-w-xl animate-fade-up-delay text-lg text-ink-muted md:text-xl">
            Osem kapitol prežitia, denné výzvy a spoločné party úlohy.
            Postupuj lesom, baníctvom a Netherom – zbieraj body a staň sa
            legendou triedy.
          </p>
          <div className="mt-10 flex flex-wrap gap-3 animate-fade-up-delay-2">
            <Link href="/kampan" className="btn-primary">
              Otvor kampaň
            </Link>
            <Link href="/rebricek" className="btn-secondary">
              Pozri rebríček
            </Link>
          </div>
        </div>
      </section>

      <section className="section-shell grid gap-8 py-16 md:grid-cols-3">
        {[
          {
            title: "Kampaň",
            text: "Osem kapitol od prvého tábora až po Endera. Každá kapitola končí milníkom so vzácnou odmenou.",
            href: "/kampan",
          },
          {
            title: "Denné & party",
            text: "Každý deň tri osobné úlohy a spoločné party výzvy, ktoré spájajú celú triedu.",
            href: "/denne",
          },
          {
            title: "Rebríček",
            text: "Týždenné a celkové body ukazujú, kto je momentálne na čele Výpravy.",
            href: "/rebricek",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group border-t border-[var(--line)] pt-5 transition-transform hover:-translate-y-0.5"
          >
            <h2 className="font-display text-2xl text-pine-900 group-hover:text-pine-700">
              {item.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.text}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
