"use client";

import { useState, useTransition } from "react";
import {
  copyDraftAction,
  endAction,
  removeQuestAction,
  saveMetaAction,
  saveQuestAction,
  startAction,
  type ActionResult,
} from "@/lib/admin-actions";
import { formatSkRange, toBratislavaInput } from "@/lib/dates";
import {
  MATRIX_MATERIALS,
  TRACKING_OPTIONS,
  materialLabel,
  materialsFor,
  trackingLabel,
} from "@/lib/matrices";
import type { AdminDesk, AdminQuestCard } from "@/lib/admin-store";

const GROUPS = [
  { id: "kampan", label: "Kampaň", text: "Kapitoly a milníky, ktoré hráč prechádza po poradí." },
  { id: "denne", label: "Denné", text: "Krátke osobné úlohy na jeden deň." },
  { id: "tyzdenne", label: "Týždenné", text: "Väčšie úlohy na celý týždeň." },
  { id: "dlhodobe", label: "Dlhodobé", text: "Ciele, ktoré trvajú celú výpravu." },
  { id: "spolocne", label: "Spoločné", text: "Celý server ťahá jeden cieľ." },
  { id: "party", label: "Party", text: "Partia si postup počíta spolu." },
] as const;

const STATUS: Record<AdminDesk["status"], string> = {
  draft: "návrh",
  active: "aktívna",
  ended: "skončená",
};

export function ExpeditionDesk({
  desk,
  notice,
}: {
  desk: AdminDesk;
  notice?: string;
}) {
  const [message, setMessage] = useState<string | null>(notice ?? null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(action: (form: FormData) => Promise<ActionResult>, form: FormData, close = false) {
    setError(null);
    start(async () => {
      const result = await action(form);
      if (!result) return;
      if (result.ok) {
        setMessage(result.message);
        setError(null);
        if (close) setEditing(null);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div>
      {message ? <p className="admin-note">{message}</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}

      <section className="air-card">
        <span className={`status status-${desk.status}`}>{STATUS[desk.status]}</span>
        <p className="tiny" style={{ marginTop: 8 }}>
          Server {desk.serverLabel} · {formatSkRange(desk.startsAt, desk.endsAt)}
        </p>
        <MetaForm
          desk={desk}
          pending={pending}
          onSave={(form) => run(saveMetaAction, form)}
        />
        <div className="admin-row" style={{ marginTop: 8 }}>
          {desk.status === "draft" ? (
            <button
              className="admin-btn"
              type="button"
              disabled={pending}
              onClick={() => {
                const form = new FormData();
                form.set("expeditionId", desk.id);
                run(startAction, form);
              }}
            >
              Spustiť
            </button>
          ) : null}
          {desk.status === "active" ? (
            <button
              className="admin-btn-danger"
              type="button"
              disabled={pending}
              onClick={() => {
                const form = new FormData();
                form.set("expeditionId", desk.id);
                run(endAction, form);
              }}
            >
              Ukončiť
            </button>
          ) : null}
        </div>
        <p className="tiny">
          Spustiť sa dá len návrh, ktorého dátum od už nastal a dátum do ešte nie. Na jednom
          serveri beží naraz jedna výprava.
        </p>
      </section>

      <CopyForm desk={desk} pending={pending} onCopy={(form) => run(copyDraftAction, form)} />

      {GROUPS.map((group) => {
        const quests = desk.quests.filter((quest) => quest.kind === group.id);
        const adding = editing === `new:${group.id}`;
        return (
          <section key={group.id} className="kind-block">
            <div className="kind-head">
              <div>
                <h2>{group.label}</h2>
                <p className="tiny">{group.text}</p>
              </div>
              <button
                className="admin-btn-quiet"
                type="button"
                onClick={() => setEditing(adding ? null : `new:${group.id}`)}
              >
                {adding ? "Zavrieť" : "Pridať úlohu"}
              </button>
            </div>
            {adding ? (
              <QuestForm
                kind={group.id}
                expeditionId={desk.id}
                pending={pending}
                onSubmit={(form) => run(saveQuestAction, form, true)}
              />
            ) : null}
            {quests.length === 0 ? (
              <p className="muted">V tejto skupine zatiaľ nie je žiadna úloha.</p>
            ) : (
              <div className="quest-grid">
                {quests.map((quest) =>
                  editing === quest.id ? (
                    <QuestForm
                      key={quest.id}
                      kind={quest.kind}
                      expeditionId={desk.id}
                      quest={quest}
                      pending={pending}
                      onSubmit={(form) => run(saveQuestAction, form, true)}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <QuestCard
                      key={quest.id}
                      quest={quest}
                      pending={pending}
                      onEdit={() => setEditing(quest.id)}
                      onRemove={() => {
                        const form = new FormData();
                        form.set("expeditionId", desk.id);
                        form.set("questId", quest.id);
                        run(removeQuestAction, form);
                      }}
                    />
                  ),
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function MetaForm({
  desk,
  pending,
  onSave,
}: {
  desk: AdminDesk;
  pending: boolean;
  onSave: (form: FormData) => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(new FormData(event.currentTarget));
      }}
    >
      <input type="hidden" name="expeditionId" value={desk.id} />
      <label className="admin-field">
        <span>Názov</span>
        <input name="title" defaultValue={desk.title} required maxLength={120} />
      </label>
      <label className="admin-field">
        <span>O čom výprava je</span>
        <textarea name="description" defaultValue={desk.description} maxLength={600} />
      </label>
      <div className="split">
        <label className="admin-field">
          <span>Od</span>
          <input type="datetime-local" name="startsAt" defaultValue={toBratislavaInput(desk.startsAt)} />
        </label>
        <label className="admin-field">
          <span>Do</span>
          <input type="datetime-local" name="endsAt" defaultValue={toBratislavaInput(desk.endsAt)} />
        </label>
      </div>
      <button className="admin-btn-quiet" type="submit" disabled={pending}>
        Uložiť termín
      </button>
    </form>
  );
}

function CopyForm({
  desk,
  pending,
  onCopy,
}: {
  desk: AdminDesk;
  pending: boolean;
  onCopy: (form: FormData) => void;
}) {
  const [serverId, setServerId] = useState(desk.serverId);
  const [custom, setCustom] = useState(false);
  return (
    <section className="air-card" style={{ marginTop: 14 }}>
      <h2 style={{ marginTop: 0 }}>Kopírovať ako nový návrh</h2>
      <p className="tiny">
        Kópia dostane vlastné úlohy. Hráčsky postup sa neprenáša. Ak by sa termín prekrýval s
        bežiacou výpravou, dátumy ostanú prázdne.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          if (!custom) form.set("serverId", serverId);
          onCopy(form);
        }}
      >
        <input type="hidden" name="expeditionId" value={desk.id} />
        <label className="admin-field">
          <span>Názov kópie</span>
          <input name="title" defaultValue={`Kópia: ${desk.title}`} required maxLength={120} />
        </label>
        <label className="admin-field">
          <span>Server</span>
          <select
            value={custom ? "__new" : serverId}
            onChange={(event) => {
              if (event.target.value === "__new") {
                setCustom(true);
              } else {
                setCustom(false);
                setServerId(event.target.value);
              }
            }}
          >
            {desk.servers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.label}
              </option>
            ))}
            <option value="__new">Iný server</option>
          </select>
        </label>
        {custom ? (
          <label className="admin-field">
            <span>Názov nového servera</span>
            <input name="serverId" required pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" placeholder="napr. trieda-8b" />
          </label>
        ) : null}
        <button className="admin-btn" type="submit" disabled={pending}>
          Vytvoriť kópiu
        </button>
      </form>
    </section>
  );
}

function QuestCard({
  quest,
  pending,
  onEdit,
  onRemove,
}: {
  quest: AdminQuestCard;
  pending: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <article className="quest-card">
      <h3>{quest.title}</h3>
      <p className="tiny">{quest.description}</p>
      <p className="goal-line">{quest.goalLabel}</p>
      <div className="chip-row">
        <span className="soft-chip">{quest.points} bodov</span>
        <span className="soft-chip">od kapitoly {quest.minChapter}</span>
        {quest.chapterTitle ? <span className="soft-chip">{quest.chapterTitle}</span> : null}
        {quest.rewards.map((reward) => (
          <span className="soft-chip" key={`${reward.material}-${reward.amount}`}>
            {materialLabel(reward.material)} ×{reward.amount}
          </span>
        ))}
      </div>
      <div className="admin-row" style={{ marginTop: 14 }}>
        <button className="admin-btn-quiet" type="button" onClick={onEdit}>
          Upraviť
        </button>
        {confirming ? (
          <button className="admin-btn-danger" type="button" disabled={pending} onClick={onRemove}>
            Naozaj odstrániť
          </button>
        ) : (
          <button className="admin-btn-danger" type="button" onClick={() => setConfirming(true)}>
            Odstrániť
          </button>
        )}
      </div>
    </article>
  );
}

function QuestForm({
  kind,
  expeditionId,
  quest,
  pending,
  onSubmit,
  onCancel,
}: {
  kind: string;
  expeditionId: string;
  quest?: AdminQuestCard;
  pending: boolean;
  onSubmit: (form: FormData) => void;
  onCancel?: () => void;
}) {
  const [tracking, setTracking] = useState(quest?.tracking ?? "break_block");
  const choices = materialsFor(tracking);
  return (
    <form
      className="editor-card"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}
    >
      <input type="hidden" name="expeditionId" value={expeditionId} />
      <input type="hidden" name="kind" value={kind} />
      {quest ? <input type="hidden" name="questId" value={quest.id} /> : null}
      <label className="admin-field">
        <span>Názov</span>
        <input name="title" required maxLength={120} defaultValue={quest?.title ?? ""} />
      </label>
      <label className="admin-field">
        <span>Text pre hráča</span>
        <textarea name="description" maxLength={600} defaultValue={quest?.description ?? ""} />
      </label>
      <label className="admin-field">
        <span>Čo sa počíta</span>
        <select
          name="tracking"
          value={tracking}
          onChange={(event) => setTracking(event.target.value)}
        >
          {TRACKING_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {tracking === "join" ? (
        <p className="tiny">Počíta sa prihlásenie na server.</p>
      ) : (
        <fieldset style={{ border: 0, margin: "0 0 12px", padding: 0 }}>
          <legend className="tiny">Cieľ</legend>
          <div className="check-grid">
            {(choices.length ? choices : MATRIX_MATERIALS).map((item) => (
              <label className="check" key={item.id}>
                <input
                  type="checkbox"
                  name="filters"
                  value={item.id}
                  defaultChecked={quest?.filters.includes(item.id) ?? false}
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="split">
        <label className="admin-field">
          <span>Koľko</span>
          <input name="targetCount" type="number" min={1} required defaultValue={quest?.targetCount ?? 16} />
        </label>
        <label className="admin-field">
          <span>Body</span>
          <input name="points" type="number" min={0} required defaultValue={quest?.points ?? 10} />
        </label>
        <label className="admin-field">
          <span>Od kapitoly</span>
          <input name="minChapter" type="number" min={1} required defaultValue={quest?.minChapter ?? 1} />
        </label>
      </div>
      <div className="split">
        <label className="admin-field">
          <span>Odmena</span>
          <select name="rewardMaterial" defaultValue={quest?.rewards[0]?.material ?? ""}>
            <option value="">Bez odmeny</option>
            {MATRIX_MATERIALS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Počet odmeny</span>
          <input name="rewardAmount" type="number" min={0} defaultValue={quest?.rewards[0]?.amount ?? 0} />
        </label>
      </div>
      {kind === "kampan" ? (
        <>
          <div className="split">
            <label className="admin-field">
              <span>Kapitola</span>
              <input name="chapterTitle" required defaultValue={quest?.chapterTitle ?? ""} />
            </label>
            <label className="admin-field">
              <span>Poradie kapitoly</span>
              <input name="chapterOrder" type="number" min={1} required defaultValue={quest?.chapterOrder ?? 1} />
            </label>
          </div>
          <label className="admin-field">
            <span>Text kapitoly</span>
            <textarea name="chapterDescription" defaultValue={quest?.chapterDescription ?? ""} />
          </label>
          <div className="split">
            <label className="admin-field">
              <span>Milník</span>
              <input name="milestoneName" defaultValue={quest?.milestoneName ?? ""} />
            </label>
            <label className="admin-field">
              <span>Body milníka</span>
              <input name="milestonePoints" type="number" min={0} defaultValue={quest?.milestonePoints ?? 40} />
            </label>
          </div>
        </>
      ) : null}
      <div className="admin-row">
        <button className="admin-btn" type="submit" disabled={pending}>
          {quest ? "Uložiť úlohu" : "Pridať úlohu"}
        </button>
        {onCancel ? (
          <button className="admin-btn-quiet" type="button" onClick={onCancel}>
            Zrušiť
          </button>
        ) : null}
      </div>
      <p className="tiny">Sledovanie: {trackingLabel(tracking)}.</p>
    </form>
  );
}
