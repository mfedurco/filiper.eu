import { loginAction, logoutAction } from "@/lib/admin-actions";
import { adminConfigured, isAdminAuthed } from "@/lib/admin-auth";
import { listAdminOverview } from "@/lib/admin-store";
import { hasDatabase } from "@/lib/db";
import { formatSkRange } from "@/lib/dates";
import { GenerateForm } from "@/components/admin/generate-form";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  draft: "návrh",
  active: "aktívna",
  ended: "skončená",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ chyba?: string }>;
}) {
  const params = await searchParams;
  if (!adminConfigured()) {
    return (
      <section className="air-card login-card">
        <h2>Admin je zamknutý</h2>
        <p className="muted">
          Na serveri chýba ADMIN_SECRET. Kým ho nedoplníš, táto stránka nič nezapisuje.
        </p>
      </section>
    );
  }

  if (!(await isAdminAuthed())) {
    return (
      <form className="air-card login-card" action={loginAction}>
        <h2>Odomknúť admin</h2>
        <p className="muted">Spoločné heslo pre študenta, ktorý spravuje server.</p>
        <label className="admin-field">
          <span>Heslo</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {params.chyba ? <p className="admin-error">Heslo nesedí.</p> : null}
        <button className="admin-btn" type="submit">
          Vstúpiť
        </button>
      </form>
    );
  }

  if (!hasDatabase()) {
    return (
      <section className="air-card">
        <h2>Databáza nie je pripojená</h2>
        <p className="muted">
          Bez DATABASE_URL admin nič nezapíše. Verejné stránky ostanú prázdne.
        </p>
        <form action={logoutAction}>
          <button className="admin-btn-quiet" type="submit">
            Odhlásiť
          </button>
        </form>
      </section>
    );
  }

  let servers: Awaited<ReturnType<typeof listAdminOverview>> = [];
  let failed = false;
  try {
    servers = await listAdminOverview();
  } catch {
    failed = true;
  }

  return (
    <div>
      <div className="admin-row" style={{ justifyContent: "space-between" }}>
        <p className="admin-lead">
          Jedna výprava je mesačný balík úloh pre jeden server. Kópia na inom serveri žije
          samostatne.
        </p>
        <form action={logoutAction}>
          <button className="admin-btn-quiet" type="submit">
            Odhlásiť
          </button>
        </form>
      </div>

      {failed ? (
        <p className="admin-error">Zoznam výprav sa nepodarilo načítať.</p>
      ) : (
        <>
          <GenerateForm servers={servers.map((server) => ({ id: server.id, label: server.label }))} />
          {servers.map((server) => (
            <section key={server.id} className="server-block">
              <h2>{server.label}</h2>
              {server.expeditions.length === 0 ? (
                <p className="muted">Tento server ešte nemá výpravu.</p>
              ) : (
                <div className="card-grid">
                  {server.expeditions.map((expedition) => (
                    <article key={expedition.id} className="air-card">
                      <span className={`status status-${expedition.status}`}>
                        {STATUS[expedition.status]}
                      </span>
                      <h3>{expedition.title}</h3>
                      <p className="tiny">{formatSkRange(expedition.startsAt, expedition.endsAt)}</p>
                      <p className="muted">{expedition.quests} úloh</p>
                      <Link className="admin-btn" href={`/admin/vyprava/${expedition.id}`}>
                        Otvoriť
                      </Link>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
