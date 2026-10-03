import type { Metadata } from "next";
import Link from "next/link";
import { readSession } from "@/lib/google-auth";
import {
  createPrivacyRequestAction,
  listPrivacyRequests,
  type PrivacyRequestType,
} from "@/lib/privacy-actions";
import { PageHero } from "@/components/ui";

export const metadata: Metadata = { title: "Môj účet a údaje" };
export const dynamic = "force-dynamic";

const labels: Record<PrivacyRequestType, string> = {
  export: "Kópia mojich údajov",
  unlink: "Odpojenie Google účtu od hráča",
  delete: "Vymazanie účtu a osobných údajov",
};

export default async function AccountPage() {
  const session = await readSession();
  const requests = session ? await listPrivacyRequests(session.sub) : [];

  return (
    <main className="pb-20 pt-8">
      <PageHero
        title="Môj účet a údaje"
        description="Tu môžeš požiadať o kópiu, odpojenie alebo vymazanie. Nič sa nevymaže automaticky: správca žiadosť bezpečne overí a vybaví."
      />
      <div className="section-shell grid gap-6 lg:grid-cols-2">
        <section className="surface-strong px-6 py-6 md:px-8">
          <h2 className="font-display text-2xl text-pine-950">Žiadosť</h2>
          {!session ? (
            <>
              <p className="mt-3 text-ink-muted">Najprv sa prihlás rovnakým Google účtom, ktorý je prepojený s profilom.</p>
              <Link className="button mt-5 inline-flex" href="/api/auth/google?next=/ucet">
                Prihlásiť cez Google
              </Link>
            </>
          ) : (
            <div className="mt-4 space-y-3">
              {(Object.keys(labels) as PrivacyRequestType[]).map((type) => (
                <form action={createPrivacyRequestAction} key={type}>
                  <input type="hidden" name="type" value={type} />
                  <button className="button w-full" type="submit">{labels[type]}</button>
                </form>
              ))}
              <p className="text-sm text-ink-muted">
                Ak účet patrí dieťaťu, správca môže pred vybavením požiadať zákonného zástupcu o primerané overenie.
              </p>
            </div>
          )}
        </section>

        <section className="surface-strong px-6 py-6 md:px-8">
          <h2 className="font-display text-2xl text-pine-950">Moje žiadosti</h2>
          {!session ? (
            <p className="mt-3 text-ink-muted">Po prihlásení tu uvidíš stav.</p>
          ) : requests.length === 0 ? (
            <p className="mt-3 text-ink-muted">Zatiaľ nemáš žiadnu žiadosť.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {requests.map((request) => (
                <li className="border-b border-black/10 pb-3" key={`${request.type}-${request.requestedAt.toISOString()}`}>
                  <p className="font-semibold text-pine-950">{labels[request.type]}</p>
                  <p className="text-sm text-ink-muted">
                    {request.status === "pending" ? "Čaká na vybavenie" : request.status === "completed" ? "Vybavená" : "Zamietnutá"}
                    {" · "}
                    {request.requestedAt.toLocaleDateString("sk-SK")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
