import Image from "next/image";
import Link from "next/link";

const cards = [
  {
    title: "Denné & týždenné",
    text: "Každý deň tri osobné úlohy, každý týždeň väčšie výzvy s lepšími odmenami.",
    href: "/denne",
    icon: "/hlbina/icon-daily.jpg",
  },
  {
    title: "Dlhodobé",
    text: "Sezónne míľniky pre tých, čo vydržia — od baníctva po Nether.",
    href: "/dlhodobe",
    icon: "/hlbina/icon-longterm.jpg",
  },
  {
    title: "Spoločné",
    text: "Celý server ťahá za jeden povraz. Príspevky hráčov sú viditeľné v hre aj tu.",
    href: "/spolocne",
    icon: "/hlbina/icon-shared.jpg",
  },
  {
    title: "Kampaň & top",
    text: "Osem kapitol s milníkmi a rebríček bodov pre triedu.",
    href: "/kampan",
    icon: "/hlbina/icon-campaign.jpg",
  },
];

export default function HomePage() {
  return (
    <main>
      <div className="hero-frame">
        <Image
          src="/hlbina/hero-night.jpg"
          alt="Nočná kamenná sieň s ametystovými kryštálmi, lampášmi a tromi postavami v plášťoch"
          fill
          priority
          sizes="(max-width: 1100px) 100vw, 1100px"
        />
      </div>
      <p className="kicker">Survival výprava · triedny server</p>
      <h1 className="font-display text-5xl text-moss-50 md:text-7xl">Výprava</h1>
      <p className="lead">
        Denné, týždenné a sezónne ciele. Spoločné mosty a banícke smeny. Osem
        kapitol prežitia — v hre aj na webe.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/kampan" className="btn-primary">
          Otvor kampaň
        </Link>
        <Link href="/spolocne" className="btn-secondary">
          Spoločné ciele
        </Link>
      </div>

      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        {cards.map((item) => (
          <Link key={item.href} href={item.href} className="card-link">
            <span className="slot-icon mb-3 inline-block">
              <Image src={item.icon} alt="" width={56} height={56} />
            </span>
            <h2 className="font-display text-2xl text-moss-50">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-mist-muted">{item.text}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
