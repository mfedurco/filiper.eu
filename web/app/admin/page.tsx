import { bootstrapAction, logoutAction, setRoleAction } from "@/lib/admin-actions";
import { adminConfigured } from "@/lib/admin-auth";
import { listAdminOverview } from "@/lib/admin-store";
import { GenerateForm } from "@/components/admin/generate-form";
import { allowsServer, loadAdminView, type PortalAccount } from "@/lib/portal-accounts";
import { formatSkRange } from "@/lib/dates";
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
  searchParams: Promise<{ chyba?: string; oznam?: string; google?: string }>;
}) {
  const params = await searchParams;
  const view = await loadAdminView();

  if (view.kind === "google-off" || params.google === "off") {
    return (
      <section className="air-card login-card">
        <h2>Prihlásenie cez Google nie je nastavené</h2>
        <p className="muted">
          Na serveri chýba GOOGLE_CLIENT_ID alebo GOOGLE_CLIENT_SECRET. Kým ich nedoplníš, admin nič
          nezapisuje.
        </p>
      </section>
    );
  }

  if (view.kind === "signed-out") {
    return (
      <section className="air-card login-card">
        <h2>Prihlásenie správcu</h2>
        <p className="muted">Výpravy spravuje Google účet s rolou správcu.</p>
        <a className="admin-btn" href="/api/auth/google?next=/admin">
          Prihlásiť sa cez Google
        </a>
      </section>
    );
  }

  if (view.kind === "no-database") {
    return (
      <section className="air-card">
        <h2>Databáza nie je pripojená</h2>
        <p className="muted">Bez DATABASE_URL admin nič nezapíše. Verejné stránky ostanú prázdne.</p>
        <form action={logoutAction}>
          <button className="admin-btn-quiet" type="submit">
            Odhlásiť
          </button>
        </form>
      </section>
    );
  }

  if (view.kind === "bootstrap") {
    return (
      <section className="air-card login-card">
        <h2>Prvý správca</h2>
        <p className="muted">
          Prihlásený účet {view.account.displayName || view.account.email} ešte nikoho nespravuje. Kto pozná
          ADMIN_SECRET, uloží tento Google účet ako správcu všetkých serverov.
        </p>
        {adminConfigured() ? (
          <form action={bootstrapAction}>
            <label className="admin-field">
              <span>ADMIN_SECRET</span>
              <input name="secret" type="password" autoComplete="current-password" required />
            </label>
            {params.chyba ? <p className="admin-error">Heslo nesedí, alebo správca už existuje.</p> : null}
            <button className="admin-btn" type="submit">
              Uložiť ma ako správcu
            </button>
          </form>
        ) : (
          <p className="admin-error">Na serveri chýba ADMIN_SECRET, takže prvého správcu zatiaľ nie je ako uložiť.</p>
        )}
        <form action={logoutAction}>
          <button className="admin-btn-quiet" type="submit">
            Odhlásiť
          </button>
        </form>
      </section>
    );
  }

  if (view.kind === "denied") {
    return (
      <section className="air-card login-card">
        <h2>Tento účet výpravy nespravuje</h2>
        <p className="muted">Hráčsky Google účet sem nepatrí. Správca všetkých serverov mu môže rolu zmeniť.</p>
        <form action={logoutAction}>
          <button className="admin-btn-quiet" type="submit">
            Odhlásiť
          </button>
        </form>
      </section>
    );
  }

  const account = view.account;
  let servers: Awaited<ReturnType<typeof listAdminOverview>> = [];
  let failed = false;
  try {
    servers = (await listAdminOverview()).filter((server) => allowsServer(account, server.id));
  } catch {
    failed = true;
  }

  return (
    <div>
      <div className="admin-row" style={{ justifyContent: "space-between" }}>
        <p className="admin-lead">
          Tu sú servery, ktoré spravuje {account.displayName || account.email}. Pri každom je výprava, ktorá
          práve beží, jej dátumy a stav.
        </p>
        <form action={logoutAction}>
          <button className="admin-btn-quiet" type="submit">
            Odhlásiť
          </button>
        </form>
      </div>
      {params.oznam ? <p className="admin-note">{params.oznam}</p> : null}

      {failed ? (
        <p className="admin-error">Zoznam serverov sa nepodarilo načítať.</p>
      ) : (
        <>
          {servers.length === 0 ? (
            <p className="muted">
              {account.allServers
                ? "Zatiaľ tu nie je žiadny server. Prvý vznikne s novým návrhom."
                : "Tomuto účtu zatiaľ nie je priradený žiadny server."}
            </p>
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
                      <p className="tiny">{server.hasKey ? "Kľúč je nastavený." : "Bez kľúča."}</p>
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
          <GenerateForm
            servers={servers.map((server) => ({ id: server.id, label: server.label }))}
            allowNewServer={account.allServers}
          />
        </>
      )}

      {account.allServers ? <RoleList others={view.others} /> : null}
    </div>
  );
}

function RoleList({ others }: { others: PortalAccount[] }) {
  return (
    <section className="air-card">
      <h2>Účty</h2>
      <p className="tiny">
        Rolu meníš len účtom, ktorý sa už prihlásil cez Google. Svoj účet tu nemeníš. Hráč nemá rozsah
        serverov.
      </p>
      {others.length === 0 ? (
        <p className="muted">Zatiaľ sa neprihlásil nikto iný.</p>
      ) : (
        others.map((account) => (
          <form key={account.googleSub} className="admin-field" action={setRoleAction}>
            <input type="hidden" name="targetSub" value={account.googleSub} />
            <span>
              {account.displayName || account.email} · {account.email}
            </span>
            <label className="admin-field">
              <span>Rola</span>
              <select name="role" defaultValue={account.role}>
                <option value="hrac">hráč</option>
                <option value="spravca">správca</option>
              </select>
            </label>
            <label className="admin-field">
              <span>
                <input type="checkbox" name="allServers" defaultChecked={account.allServers} /> Všetky servery
              </span>
            </label>
            <label className="admin-field">
              <span>Server ids, ak nie sú všetky</span>
              <input name="serverIds" defaultValue={account.serverIds.join(" ")} placeholder="survival creative" />
            </label>
            <button className="admin-btn-quiet" type="submit">
              Uložiť rolu
            </button>
          </form>
        ))
      )}
    </section>
  );
}
