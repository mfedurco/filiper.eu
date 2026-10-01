import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-[var(--line)] py-10">
      <div className="section-shell flex flex-col gap-3 text-sm text-ink-muted md:flex-row md:items-center md:justify-between">
        <p>
          <span className="font-display text-base font-semibold text-pine-900">Výprava</span>
          {" · "}survival questy pre triedny Paper server
        </p>
        <div className="flex gap-4">
          <Link href="/kampan" className="hover:text-pine-800">
            Kampaň
          </Link>
          <Link href="/denne" className="hover:text-pine-800">
            Denné
          </Link>
          <Link href="/admin" className="hover:text-pine-800">
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
