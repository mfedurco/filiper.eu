"use client";

import { useState } from "react";
import type {
  AdminSettings,
  Campaign,
  Chapter,
  Quest,
  QuestPool,
  RewardItem,
} from "@/lib/types";
import { QUEST_TYPE_LABELS } from "@/lib/quest-labels";

type Bundle = {
  campaign: Campaign;
  daily: QuestPool;
  party: QuestPool;
  settings: AdminSettings;
};

type Tab = "kampan" | "denne" | "party" | "nastavenia";

type AdminAppProps = {
  initialAuthed: boolean;
  initialBundle: Bundle | null;
  initialError?: string | null;
};

const QUEST_TYPES = Object.keys(QUEST_TYPE_LABELS);

function emptyQuest(prefix: string): Quest {
  return {
    id: `${prefix}_${Date.now().toString(36)}`,
    name: "Nová úloha",
    description: "",
    type: "BREAK_BLOCK",
    targets: [],
    amount: 1,
    points: 10,
    rewards: [],
    minChapter: 1,
  };
}

function emptyChapter(order: number): Chapter {
  return {
    id: `chapter_${order}`,
    order,
    name: `Kapitola ${order}`,
    description: "",
    quests: [emptyQuest(`c${order}`)],
    milestone: {
      name: "Milník",
      points: 50,
      rewards: [{ material: "IRON_INGOT", amount: 4 }],
    },
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-pine-600";

function RewardsEditor({
  rewards,
  onChange,
  enabled,
}: {
  rewards: RewardItem[];
  onChange: (next: RewardItem[]) => void;
  enabled: boolean;
}) {
  if (!enabled) {
    return (
      <p className="text-xs text-ink-muted">
        Odmeny sú vypnuté v nastaveniach.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rewards.map((reward, index) => (
        <div key={index} className="flex gap-2">
          <input
            className={inputClass}
            value={reward.material}
            onChange={(e) => {
              const next = [...rewards];
              next[index] = { ...reward, material: e.target.value };
              onChange(next);
            }}
            placeholder="MATERIAL"
          />
          <input
            type="number"
            className={`${inputClass} w-24`}
            value={reward.amount}
            onChange={(e) => {
              const next = [...rewards];
              next[index] = {
                ...reward,
                amount: Number(e.target.value) || 0,
              };
              onChange(next);
            }}
          />
          <button
            type="button"
            className="rounded-lg px-2 text-sm text-[#8a4a22]"
            onClick={() => onChange(rewards.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-sm font-medium text-pine-700"
        onClick={() =>
          onChange([...rewards, { material: "IRON_INGOT", amount: 1 }])
        }
      >
        + odmena
      </button>
    </div>
  );
}

function QuestEditor({
  quest,
  onChange,
  onRemove,
  showMinChapter,
  pointsEnabled,
  rewardsEnabled,
  minChapterEnforced,
}: {
  quest: Quest;
  onChange: (q: Quest) => void;
  onRemove: () => void;
  showMinChapter: boolean;
  pointsEnabled: boolean;
  rewardsEnabled: boolean;
  minChapterEnforced: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-display text-lg text-pine-900">{quest.name || "Úloha"}</p>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-semibold uppercase tracking-wide text-[#8a4a22]"
        >
          Odstrániť
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="ID">
          <input
            className={inputClass}
            value={quest.id}
            onChange={(e) => onChange({ ...quest, id: e.target.value })}
          />
        </Field>
        <Field label="Názov">
          <input
            className={inputClass}
            value={quest.name}
            onChange={(e) => onChange({ ...quest, name: e.target.value })}
          />
        </Field>
        <Field label="Popis">
          <textarea
            className={inputClass}
            rows={2}
            value={quest.description}
            onChange={(e) =>
              onChange({ ...quest, description: e.target.value })
            }
          />
        </Field>
        <Field label="Typ">
          <select
            className={inputClass}
            value={quest.type}
            onChange={(e) => onChange({ ...quest, type: e.target.value })}
          >
            {QUEST_TYPES.map((type) => (
              <option key={type} value={type}>
                {QUEST_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ciele (čiarkou)">
          <input
            className={inputClass}
            value={(quest.targets ?? []).join(", ")}
            onChange={(e) =>
              onChange({
                ...quest,
                targets: e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <Field label="Počet">
          <input
            type="number"
            className={inputClass}
            value={quest.amount}
            onChange={(e) =>
              onChange({ ...quest, amount: Number(e.target.value) || 1 })
            }
          />
        </Field>
        {pointsEnabled ? (
          <Field label="Body">
            <input
              type="number"
              className={inputClass}
              value={quest.points}
              onChange={(e) =>
                onChange({ ...quest, points: Number(e.target.value) || 0 })
              }
            />
          </Field>
        ) : (
          <p className="text-xs text-ink-muted self-end">Body sú vypnuté.</p>
        )}
        {showMinChapter && minChapterEnforced ? (
          <Field label="Min. kapitola">
            <input
              type="number"
              className={inputClass}
              value={quest.minChapter ?? 1}
              onChange={(e) =>
                onChange({
                  ...quest,
                  minChapter: Number(e.target.value) || 1,
                })
              }
            />
          </Field>
        ) : null}
      </div>
      <div className="mt-3">
        <p className="mb-1 text-sm font-medium text-ink-muted">Odmeny</p>
        <RewardsEditor
          enabled={rewardsEnabled}
          rewards={quest.rewards ?? []}
          onChange={(rewards) => onChange({ ...quest, rewards })}
        />
      </div>
    </div>
  );
}

export function AdminApp({
  initialAuthed,
  initialBundle,
  initialError = null,
}: AdminAppProps) {
  const [authed, setAuthed] = useState(initialAuthed);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(initialBundle);
  const [tab, setTab] = useState<Tab>("kampan");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [loggingIn, setLoggingIn] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setLoggingIn(false);
      setLoginError("Nesprávne heslo.");
      return;
    }
    const dataRes = await fetch("/api/admin/quests");
    setLoggingIn(false);
    if (!dataRes.ok) {
      setLoginError("Prihlásenie OK, ale dáta sa nenačítali.");
      return;
    }
    const data = (await dataRes.json()) as Bundle;
    setPassword("");
    setBundle(data);
    setLoadError(null);
    setAuthed(true);
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    setAuthed(false);
    setBundle(null);
  }

  async function save() {
    if (!bundle) return;
    setSaving(true);
    setStatus(null);
    const res = await fetch("/api/admin/quests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bundle),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setStatus(data.error ?? "Uloženie zlyhalo.");
      return;
    }
    setStatus(
      data.note ??
        "Uložené do web/data/quests/. Plugin môže tieto súbory synchronizovať.",
    );
  }

  if (!authed) {
    return (
      <div className="section-shell max-w-md py-16">
        <h1 className="font-display text-4xl text-pine-950">Admin</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Zadaj heslo z <code>VYPRVA_ADMIN_PASSWORD</code> (lokálne default{" "}
          <code>vyprava</code>).
        </p>
        <form onSubmit={login} className="mt-6 space-y-4">
          <Field label="Heslo">
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          {loginError ? (
            <p className="text-sm text-[#8a4a22]">{loginError}</p>
          ) : null}
          <button type="submit" className="btn-primary" disabled={loggingIn}>
            {loggingIn ? "Prihlasujem…" : "Prihlásiť"}
          </button>
        </form>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="section-shell py-16 text-center text-[#8a4a22]">
        {loadError ?? "Chýbajú dáta."}
      </div>
    );
  }

  const { settings } = bundle;

  return (
    <div className="section-shell pb-20 pt-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-pine-950">Admin</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Upravuj kapitoly, denný a party pool. Uloženie zapisuje JSON do{" "}
            <code>web/data/quests/</code> – Paper plugin ich môže syncnúť / konvertovať do YAML.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Ukladám…" : "Uložiť"}
          </button>
          <button type="button" className="btn-secondary" onClick={logout}>
            Odhlásiť
          </button>
        </div>
      </div>

      {status ? (
        <p className="mt-4 rounded-xl border border-[var(--line)] bg-[rgba(31,69,51,0.08)] px-4 py-3 text-sm text-pine-800">
          {status}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-2">
        {(
          [
            ["kampan", "Kampaň"],
            ["denne", "Denné"],
            ["party", "Party"],
            ["nastavenia", "Nastavenia"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              tab === id
                ? "btn-primary !px-4 !py-2 text-sm"
                : "btn-secondary !px-4 !py-2 text-sm"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "kampan" ? (
        <div className="mt-8 space-y-8">
          <Field label="Názov kampane">
            <input
              className={inputClass}
              value={bundle.campaign.title}
              onChange={(e) =>
                setBundle({
                  ...bundle,
                  campaign: { ...bundle.campaign, title: e.target.value },
                })
              }
            />
          </Field>

          {bundle.campaign.chapters.map((chapter, chapterIndex) => (
            <section
              key={chapter.id}
              className="surface-strong rounded-[1.25rem] p-5 md:p-6"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-2xl text-pine-950">
                  Kapitola {chapter.order}
                </h2>
                <button
                  type="button"
                  className="text-xs font-semibold uppercase tracking-wide text-[#8a4a22]"
                  onClick={() => {
                    const chapters = bundle.campaign.chapters.filter(
                      (_, i) => i !== chapterIndex,
                    );
                    setBundle({
                      ...bundle,
                      campaign: { ...bundle.campaign, chapters },
                    });
                  }}
                >
                  Odstrániť kapitolu
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Field label="ID">
                  <input
                    className={inputClass}
                    value={chapter.id}
                    onChange={(e) => {
                      const chapters = [...bundle.campaign.chapters];
                      chapters[chapterIndex] = {
                        ...chapter,
                        id: e.target.value,
                      };
                      setBundle({
                        ...bundle,
                        campaign: { ...bundle.campaign, chapters },
                      });
                    }}
                  />
                </Field>
                <Field label="Poradie">
                  <input
                    type="number"
                    className={inputClass}
                    value={chapter.order}
                    onChange={(e) => {
                      const chapters = [...bundle.campaign.chapters];
                      chapters[chapterIndex] = {
                        ...chapter,
                        order: Number(e.target.value) || 1,
                      };
                      setBundle({
                        ...bundle,
                        campaign: { ...bundle.campaign, chapters },
                      });
                    }}
                  />
                </Field>
                <Field label="Názov">
                  <input
                    className={inputClass}
                    value={chapter.name}
                    onChange={(e) => {
                      const chapters = [...bundle.campaign.chapters];
                      chapters[chapterIndex] = {
                        ...chapter,
                        name: e.target.value,
                      };
                      setBundle({
                        ...bundle,
                        campaign: { ...bundle.campaign, chapters },
                      });
                    }}
                  />
                </Field>
                <Field label="Popis">
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={chapter.description}
                    onChange={(e) => {
                      const chapters = [...bundle.campaign.chapters];
                      chapters[chapterIndex] = {
                        ...chapter,
                        description: e.target.value,
                      };
                      setBundle({
                        ...bundle,
                        campaign: { ...bundle.campaign, chapters },
                      });
                    }}
                  />
                </Field>
              </div>

              <div className="mt-6 space-y-4">
                {chapter.quests.map((quest, questIndex) => (
                  <QuestEditor
                    key={`${chapter.id}-${quest.id}-${questIndex}`}
                    quest={quest}
                    showMinChapter={false}
                    pointsEnabled={settings.pointsEnabled}
                    rewardsEnabled={settings.rewardsEnabled}
                    minChapterEnforced={settings.minChapterEnforced}
                    onChange={(nextQuest) => {
                      const chapters = [...bundle.campaign.chapters];
                      const quests = [...chapter.quests];
                      quests[questIndex] = nextQuest;
                      chapters[chapterIndex] = { ...chapter, quests };
                      setBundle({
                        ...bundle,
                        campaign: { ...bundle.campaign, chapters },
                      });
                    }}
                    onRemove={() => {
                      const chapters = [...bundle.campaign.chapters];
                      chapters[chapterIndex] = {
                        ...chapter,
                        quests: chapter.quests.filter((_, i) => i !== questIndex),
                      };
                      setBundle({
                        ...bundle,
                        campaign: { ...bundle.campaign, chapters },
                      });
                    }}
                  />
                ))}
                <button
                  type="button"
                  className="btn-secondary !py-2 text-sm"
                  onClick={() => {
                    const chapters = [...bundle.campaign.chapters];
                    chapters[chapterIndex] = {
                      ...chapter,
                      quests: [
                        ...chapter.quests,
                        emptyQuest(`c${chapter.order}`),
                      ],
                    };
                    setBundle({
                      ...bundle,
                      campaign: { ...bundle.campaign, chapters },
                    });
                  }}
                >
                  + úloha
                </button>
              </div>

              <div className="mt-6 rounded-xl border border-[var(--line)] bg-[rgba(232,224,207,0.55)] p-4">
                <h3 className="font-display text-xl text-pine-950">Milník</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Field label="Názov">
                    <input
                      className={inputClass}
                      value={chapter.milestone.name}
                      onChange={(e) => {
                        const chapters = [...bundle.campaign.chapters];
                        chapters[chapterIndex] = {
                          ...chapter,
                          milestone: {
                            ...chapter.milestone,
                            name: e.target.value,
                          },
                        };
                        setBundle({
                          ...bundle,
                          campaign: { ...bundle.campaign, chapters },
                        });
                      }}
                    />
                  </Field>
                  {settings.pointsEnabled ? (
                    <Field label="Body">
                      <input
                        type="number"
                        className={inputClass}
                        value={chapter.milestone.points}
                        onChange={(e) => {
                          const chapters = [...bundle.campaign.chapters];
                          chapters[chapterIndex] = {
                            ...chapter,
                            milestone: {
                              ...chapter.milestone,
                              points: Number(e.target.value) || 0,
                            },
                          };
                          setBundle({
                            ...bundle,
                            campaign: { ...bundle.campaign, chapters },
                          });
                        }}
                      />
                    </Field>
                  ) : null}
                </div>
                <div className="mt-3">
                  <RewardsEditor
                    enabled={settings.rewardsEnabled}
                    rewards={chapter.milestone.rewards}
                    onChange={(rewards) => {
                      const chapters = [...bundle.campaign.chapters];
                      chapters[chapterIndex] = {
                        ...chapter,
                        milestone: { ...chapter.milestone, rewards },
                      };
                      setBundle({
                        ...bundle,
                        campaign: { ...bundle.campaign, chapters },
                      });
                    }}
                  />
                </div>
              </div>
            </section>
          ))}

          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const order = bundle.campaign.chapters.length + 1;
              setBundle({
                ...bundle,
                campaign: {
                  ...bundle.campaign,
                  chapters: [
                    ...bundle.campaign.chapters,
                    emptyChapter(order),
                  ],
                },
              });
            }}
          >
            + kapitola
          </button>
        </div>
      ) : null}

      {tab === "denne" || tab === "party" ? (
        <div className="mt-8 space-y-4">
          {(tab === "denne" ? bundle.daily.pool : bundle.party.pool).map(
            (quest, index) => (
              <QuestEditor
                key={`${tab}-${quest.id}-${index}`}
                quest={quest}
                showMinChapter
                pointsEnabled={settings.pointsEnabled}
                rewardsEnabled={settings.rewardsEnabled}
                minChapterEnforced={settings.minChapterEnforced}
                onChange={(nextQuest) => {
                  if (tab === "denne") {
                    const pool = [...bundle.daily.pool];
                    pool[index] = nextQuest;
                    setBundle({ ...bundle, daily: { pool } });
                  } else {
                    const pool = [...bundle.party.pool];
                    pool[index] = nextQuest;
                    setBundle({ ...bundle, party: { pool } });
                  }
                }}
                onRemove={() => {
                  if (tab === "denne") {
                    setBundle({
                      ...bundle,
                      daily: {
                        pool: bundle.daily.pool.filter((_, i) => i !== index),
                      },
                    });
                  } else {
                    setBundle({
                      ...bundle,
                      party: {
                        pool: bundle.party.pool.filter((_, i) => i !== index),
                      },
                    });
                  }
                }}
              />
            ),
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const quest = emptyQuest(tab === "denne" ? "d" : "p");
              if (tab === "denne") {
                setBundle({
                  ...bundle,
                  daily: { pool: [...bundle.daily.pool, quest] },
                });
              } else {
                setBundle({
                  ...bundle,
                  party: { pool: [...bundle.party.pool, quest] },
                });
              }
            }}
          >
            + úloha
          </button>
        </div>
      ) : null}

      {tab === "nastavenia" ? (
        <div className="mt-8 surface-strong max-w-xl space-y-4 rounded-[1.25rem] p-6">
          {(
            [
              ["rewardsEnabled", "Odmeny zapnuté"],
              ["pointsEnabled", "Body zapnuté"],
              ["minChapterEnforced", "Vynucovať min. kapitolu"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-3 last:border-b-0"
            >
              <span className="font-medium text-pine-900">{label}</span>
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    settings: { ...settings, [key]: e.target.checked },
                  })
                }
                className="h-5 w-5 accent-pine-700"
              />
            </label>
          ))}
          <p className="text-sm text-ink-muted">
            Tieto prepínače ovplyvňujú admin editor (skrývajú polia) a ukladajú sa do{" "}
            <code>settings.json</code> pre budúcu sync s pluginom.
          </p>
        </div>
      ) : null}
    </div>
  );
}
