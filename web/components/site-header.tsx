import Link from "next/link";

const links = [
  { href: "/kampan", label: "Kampaň" },
  { href: "/denne", label: "Denné" },
  { href: "/party", label: "Party" },
  { href: "/rebricek", label: "Rebríček" },
  { href: "/hrac", label: "Hráč" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[rgba(243,239,228,0.82)] backdrop-blur-md">
      <div className="section-shell flex items-center justify-between gap-4 py-3">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight text-pine-900">
          Výprava
        </Link>
        <nav className="hidden items-center gap-5 text-sm font-medium text-ink-muted md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-pine-800"
            >
              {link.label}
            </Link>
          ))}
          <Link href="/admin" className="text-ember-500 hover:text-[#9a4d12]">
            Admin
          </Link>
        </nav>
        <nav className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          <Link href="/kampan">Kampaň</Link>
          <Link href="/rebricek">Top</Link>
          <Link href="/admin">Admin</Link>
        </nav>
      </div>
    </header>
  );
}
