"use client";

import { useState, useTransition } from "react";
import { generateDraftAction } from "@/lib/admin-actions";

export function GenerateForm({ servers }: { servers: { id: string; label: string }[] }) {
  const [custom, setCustom] = useState(servers.length === 0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="air-card"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setMessage(null);
        start(async () => {
          const result = await generateDraftAction(form);
          if (result && !result.ok) setMessage(result.message);
        });
      }}
    >
      <h2 style={{ marginTop: 0 }}>Nový návrh z matríc</h2>
      <p className="tiny">
        Témy, činnosti, materiály a vtipné vzory mien sú v repozitári. Vyplní sa celý mesačný
        balík: kampaň, denné, týždenné, dlhodobé, spoločné aj party. Žiadna vonkajšia AI.
      </p>
      <label className="admin-field">
        <span>Server</span>
        <select
          name={custom ? undefined : "serverId"}
          defaultValue={servers[0]?.id ?? ""}
          onChange={(event) => setCustom(event.target.value === "__new")}
        >
          {servers.map((server) => (
            <option key={server.id} value={server.id}>
              {server.label}
            </option>
          ))}
          <option value="__new">Nový server</option>
        </select>
      </label>
      {custom ? (
        <label className="admin-field">
          <span>Názov nového servera</span>
          <input name="serverId" required pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" placeholder="napr. trieda-8b" />
        </label>
      ) : null}
      {message ? <p className="admin-error">{message}</p> : null}
      <button className="admin-btn" type="submit" disabled={pending}>
        {pending ? "Skladám návrh…" : "Vygenerovať návrh"}
      </button>
    </form>
  );
}
