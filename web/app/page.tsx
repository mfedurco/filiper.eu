import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <section className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="hero-sky absolute inset-0" />
          <div className="animate-drift absolute -left-16 top-10 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(74,122,88,0.35),transparent_70%)] blur-2xl" />
          <div className="animate-soft-pulse absolute right-[-5rem] top-24 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(196,163,90,0.22),transparent_70%)] blur-2xl" />
          <svg
            className="absolute bottom-0 left-0 right-0 h-48 w-full text-[#0d1a14]"
            viewBox="0 0 1440 220"
            preserveAspectRatio="none"
          >
            <path
              fill="currentColor"
              d="M0,140 L90,110 L180,150 L270,80 L360,130 L450,50 L540,120 L630,70 L720,135 L810,40 L900,110 L990,65 L1080,140 L1170,55 L1260,115 L1350,85 L1440,120 L1440,220 L0,220 Z"
            />
          </svg>
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0a1210] to-transparent" />
        </div>

        <div className="section-shell relative flex min-h-[calc(100vh-3.5rem)] flex-col justify-center py-16">
          <p className="animate-fade-up mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-lantern">
            Survival výprava · triedny server
          </p>
          <h1 className="font-display animate-fade-up max-w-4xl text-6xl font-semibold leading-[0.92] tracking-tight text-moss-50 md:text-8xl">
            Výprava
          </h1>
          <p className="mt-6 max-w-xl animate-fade-up-delay text-lg text-mist md:text-xl">
            Denné, týždenné a sezónne ciele. Spoločné mosty a banícke smeny.
            Osem kapitol prežitia — v hre aj na webe.
          </p>
          <div className="mt-10 flex flex-wrap gap-3 animate-fade-up-delay-2">
            <Link href="/kampan" className="btn-primary">
              Otvor kampaň
            </Link>
            <Link href="/spolocne" className="btn-secondary">
              Spoločné ciele
            </Link>
          </div>
        </div>
      </section>

      <section className="section-shell grid gap-10 py-16 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "Denné & týždenné",
            text: "Každý deň tri osobné úlohy, každý týždeň väčšie výzvy s lepšími odmenami.",
            href: "/denne",
          },
          {
            title: "Dlhodobé",
            text: "Sezónne míľniky pre tých, čo vydržia — od baníctva po Nether.",
            href: "/dlhodobe",
          },
          {
            title: "Spoločné",
            text: "Celý server ťahá za jeden povraz. Príspevky hráčov sú viditeľné v hre aj tu.",
            href: "/spolocne",
          },
          {
            title: "Kampaň & top",
            text: "Osem kapitol s milníkmi a rebríček bodov pre triedu.",
            href: "/kampan",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group border-t border-[var(--line)] pt-5 transition-transform hover:-translate-y-0.5"
          >
            <h2 className="font-display text-2xl text-moss-50 group-hover:text-lantern">
              {item.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-mist-muted">{item.text}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
