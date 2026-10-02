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
          Tu sú servery. Pri každom je výprava, ktorá práve beží, jej dátumy a stav. Otvor server,
          keď chceš vidieť návrhy aj staršie výpravy.
        </p>
        <form action={logoutAction}>
          <button className="admin-btn-quiet" type="submit">
            Odhlásiť
          </button>
        </form>
      </div>

      {failed ? (
        <p className="admin-error">Zoznam serverov sa nepodarilo načítať.</p>
      ) : (
        <>
          {servers.length === 0 ? (
            <p className="muted">Zatiaľ tu nie je žiadny server. Prvý vznikne s novým návrhom.</p>
          ) : (
            <div className="server-list">
              {servers.map((server) => {
                const active = server.expeditions.find((item) => item.status === "active");
                return (
                  <article key={server.id} className="air-card server-row">
                    <div>
                      <h2>{server.label}</h2>
                      {active ? (
                        <>
                          <p className="server-active">{active.title}</p>
                          <p className="tiny">{formatSkRange(active.startsAt, active.endsAt)}</p>
                        </>
                      ) : (
                        <p className="muted">Žiadna aktívna výprava.</p>
                      )}
                      <p className="tiny">Výprav na serveri: {server.expeditions.length}</p>
                    </div>
                    <div className="admin-row">
                      {active ? (
                        <span className={`status status-${active.status}`}>{STATUS[active.status]}</span>
                      ) : null}
                      <Link className="admin-btn" href={`/admin/server/${server.id}`}>
                        Otvoriť server
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <GenerateForm servers={servers.map((server) => ({ id: server.id, label: server.label }))} />
        </>
      )}
    </div>
  );
}
