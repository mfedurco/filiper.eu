import Link from "next/link";

const links = [
  { href: "/kampan", label: "Kampaň" },
  { href: "/denne", label: "Denné" },
  { href: "/tyzdenne", label: "Týždenné" },
  { href: "/dlhodobe", label: "Dlhodobé" },
  { href: "/spolocne", label: "Spoločné" },
  { href: "/rebricek", label: "Rebríček" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[rgba(10,18,16,0.82)] backdrop-blur-md">
      <div className="section-shell flex items-center justify-between gap-4 py-3">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight text-moss-50">
          Výprava
        </Link>
        <nav className="hidden items-center gap-4 text-sm font-medium text-mist-muted lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-lantern"
            >
              {link.label}
            </Link>
          ))}
          <Link href="/admin" className="text-lantern hover:text-moss-50">
            Admin
          </Link>
        </nav>
        <nav className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-mist-muted lg:hidden">
          <Link href="/spolocne">Spoločné</Link>
          <Link href="/rebricek">Top</Link>
          <Link href="/admin">Admin</Link>
        </nav>
      </div>
    </header>
  );
}
