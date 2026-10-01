import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-[var(--line)] py-10">
      <div className="section-shell flex flex-col gap-3 text-sm text-mist-muted md:flex-row md:items-center md:justify-between">
        <p>
          <span className="font-display text-base font-semibold text-moss-50">Výprava</span>
          {" · "}survival questy ·{" "}
          <a href="https://filiper.eu" className="hover:text-lantern">
            filiper.eu
          </a>
        </p>
        <div className="flex flex-wrap gap-4">
          <Link href="/kampan" className="hover:text-lantern">
            Kampaň
          </Link>
          <Link href="/spolocne" className="hover:text-lantern">
            Spoločné
          </Link>
          <Link href="/admin" className="hover:text-lantern">
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
