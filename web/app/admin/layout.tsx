import type { Metadata } from "next";
import Link from "next/link";
import "./admin.css";

export const metadata: Metadata = {
  title: "Admin výprav",
};

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-root">
      <header className="admin-top">
        <div>
          <p className="admin-kicker">Správa výprav</p>
          <h1>
            <Link href="/admin">Servery</Link>
          </h1>
        </div>
        <Link className="back-link" href="/">
          Späť na portál
        </Link>
      </header>
      <div className="admin-wrap">{children}</div>
    </div>
  );
}
