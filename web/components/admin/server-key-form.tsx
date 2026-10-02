"use client";

import { useState, useTransition } from "react";
import { rotateServerKeyAction } from "@/lib/admin-actions";

export function ServerKeyForm({ serverId, hasKey }: { serverId: string; hasKey: boolean }) {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  return (
    <section className="air-card generate-card">
      <h2 style={{ marginTop: 0 }}>Kľúč servera</h2>
      <p className="muted">
        Do pluginu ho daj ako <code>server-key</code> spolu s týmto <code>server-id</code>. Portál
        kľúč z iného servera neprijme. V databáze ostane len odtlačok.
      </p>
      {key ? (
        <>
          <p className="admin-note">
            Toto je jediný raz. Skopíruj ho teraz. Po odchode zo stránky ho už neuvidíš. Výmena
            starý kľúč zruší.
          </p>
          <label className="admin-field">
            <span>server-key</span>
            <input className="key-once" readOnly value={key} onFocus={(event) => event.currentTarget.select()} />
          </label>
          <div className="admin-row">
            <button
              className="admin-btn-quiet"
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(key).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
            >
              {copied ? "Skopírované" : "Skopírovať"}
            </button>
          </div>
        </>
      ) : (
        <p className="tiny">
          {hasKey
            ? "Kľúč je nastavený. Výmena ho nahradí a starý prestane fungovať."
            : "Kľúč ešte nie je. Bez neho sa plugin na portál nepripojí."}
        </p>
      )}
      {error ? <p className="admin-error">{error}</p> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (hasKey && !key && !window.confirm("Výmena zruší starý kľúč. Pokračovať?")) return;
          const form = new FormData(event.currentTarget);
          setError(null);
          setCopied(false);
          start(async () => {
            const result = await rotateServerKeyAction(form);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setKey(result.key);
          });
        }}
      >
        <input type="hidden" name="serverId" value={serverId} />
        <button className="admin-btn" type="submit" disabled={pending}>
          {pending ? "Pripravujem kľúč…" : hasKey || key ? "Vymeniť kľúč" : "Vygenerovať kľúč"}
        </button>
      </form>
    </section>
  );
}
