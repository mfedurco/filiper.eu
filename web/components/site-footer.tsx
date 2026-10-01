import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        Výprava · survival questy ·{" "}
        <a href="https://filiper.eu">filiper.eu</a>
      </p>
      <div className="flex flex-wrap gap-4">
        <Link href="/kampan">Kampaň</Link>
        <Link href="/spolocne">Spoločné</Link>
        <Link href="/admin">Admin</Link>
      </div>
    </footer>
  );
}
