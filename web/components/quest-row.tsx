import type { Quest, RewardItem } from "@/lib/types";
import { formatMaterial, formatTargets, questTypeLabel } from "@/lib/quest-labels";
import { ProgressBar } from "@/components/ui";
import { clampPercent } from "@/lib/utils";

export function RewardList({ rewards }: { rewards?: RewardItem[] }) {
  if (!rewards?.length) {
    return <span className="text-ink-muted">Bez odmeny</span>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {rewards.map((reward) => (
        <li
          key={`${reward.material}-${reward.amount}`}
          className="rounded-full bg-[rgba(31,69,51,0.08)] px-3 py-1 text-xs font-medium text-pine-800"
        >
          {formatMaterial(reward.material)} ×{reward.amount}
        </li>
      ))}
    </ul>
  );
}

export function QuestRow({
  quest,
  progress,
  showMinChapter = false,
}: {
  quest: Quest;
  progress?: { current: number; target: number; completed?: boolean };
  showMinChapter?: boolean;
}) {
  const percent = progress
    ? clampPercent(progress.current, progress.target)
    : null;

  return (
    <article className="border-b border-[var(--line)] py-5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="badge">{questTypeLabel(quest.type)}</span>
            {showMinChapter && quest.minChapter ? (
              <span className="badge-ember badge">min. kap. {quest.minChapter}</span>
            ) : null}
            {progress?.completed ? (
              <span className="badge bg-[rgba(42,90,66,0.18)] text-pine-800">Splnené</span>
            ) : null}
          </div>
          <h3 className="font-display text-xl text-pine-950">{quest.name}</h3>
          <p className="mt-1 text-sm text-ink-muted">{quest.description}</p>
          <p className="mt-2 text-xs text-ink-muted">
            Ciele: {formatTargets(quest.targets)} · {quest.amount}×
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl text-ember-500">+{quest.points}</p>
          <p className="text-xs uppercase tracking-wide text-ink-muted">bodov</p>
        </div>
      </div>
      {quest.rewards && quest.rewards.length > 0 ? (
        <div className="mt-3">
          <RewardList rewards={quest.rewards} />
        </div>
      ) : null}
      {percent !== null && progress ? (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-ink-muted">
            <span>
              {progress.current}/{progress.target}
            </span>
            <span>{percent}%</span>
          </div>
          <ProgressBar value={percent} />
        </div>
      ) : null}
    </article>
  );
}
