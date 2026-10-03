import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GenerateForm } from "@/components/admin/generate-form";
import { ServerKeyForm } from "@/components/admin/server-key-form";
import { listAdminOverview } from "@/lib/admin-store";
import { allowsServer, requireSpravca } from "@/lib/portal-accounts";
import { formatSkRange } from "@/lib/dates";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  draft: "návrh",
  active: "aktívna",
  ended: "skončená",
};

const RANK: Record<string, number> = {
  active: 0,
  draft: 1,
  ended: 2,
};

export default async function ServerAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const account = await requireSpravca();
  if (!account) redirect("/admin");

  const { id } = await params;
  let servers: Awaited<ReturnType<typeof listAdminOverview>>;
  try {
    servers = await listAdminOverview();
  } catch {
    return <p className="admin-error">Server sa nepodarilo načítať.</p>;
  }

  const server = servers.find((item) => item.id === id);
  if (!server || !allowsServer(account, server.id)) notFound();

  const expeditions = [...server.expeditions].sort(
    (left, right) => (RANK[left.status] ?? 9) - (RANK[right.status] ?? 9),
  );

  return (
    <div>
      <nav className="crumbs" aria-label="Cesta">
        <Link href="/admin">Servery</Link>
        <span aria-hidden="true">/</span>
        <span>{server.label}</span>
      </nav>

      <h2 className="page-title">{server.label}</h2>
      <ServerKeyForm serverId={server.id} hasKey={server.hasKey} />
      <p className="admin-lead">
        Výpravy tohto servera. Beží naraz len jedna. Návrh spustíš až vnútri výpravy, keď jej
        dátum od už nastal.
      </p>

      {expeditions.length === 0 ? (
        <p className="muted">Tento server ešte nemá výpravu. Nižšie môžeš vygenerovať prvý návrh.</p>
      ) : (
        <div className="card-grid">
          {expeditions.map((expedition) => (
            <article key={expedition.id} className="air-card">
              <span className={`status status-${expedition.status}`}>{STATUS[expedition.status]}</span>
              <h3>{expedition.title}</h3>
              <p className="tiny">{formatSkRange(expedition.startsAt, expedition.endsAt)}</p>
              <p className="muted">{expedition.quests} úloh</p>
              <Link className="admin-btn" href={`/admin/vyprava/${expedition.id}`}>
                Otvoriť výpravu
              </Link>
            </article>
          ))}
        </div>
      )}

      <GenerateForm
        servers={[{ id: server.id, label: server.label }]}
        allowNewServer={account.allServers}
      />
    </div>
  );
}
