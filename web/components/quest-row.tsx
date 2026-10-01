import type { Quest, RewardItem } from "@/lib/types";
import { formatMaterial, formatTargets, questTypeLabel } from "@/lib/quest-labels";
import { ProgressBar } from "@/components/ui";
import { clampPercent } from "@/lib/utils";

const TYPE_ICONS: Record<string, string> = {
  BREAK_BLOCK: "/hlbina/icon-longterm.jpg",
  PLACE_BLOCK: "/hlbina/icon-shared.jpg",
  KILL_ENTITY: "/hlbina/icon-party.jpg",
  CRAFT_ITEM: "/hlbina/icon-weekly.jpg",
  SMELT_ITEM: "/hlbina/icon-daily.jpg",
  PICKUP_ITEM: "/hlbina/icon-rewards.jpg",
  ENTER_WORLD: "/hlbina/icon-campaign.jpg",
};

export function RewardList({ rewards }: { rewards?: RewardItem[] }) {
  if (!rewards?.length) {
    return <span className="text-ink-muted">Bez odmeny</span>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {rewards.map((reward) => (
        <li
          key={`${reward.material}-${reward.amount}`}
          className="chip"
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

  const icon = TYPE_ICONS[quest.type] ?? "/hlbina/icon-board.jpg";

  return (
    <article className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 border-t border-[var(--line)] py-4 first:border-t-0">
      <span className="slot-icon">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" />
      </span>
      <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="badge">{questTypeLabel(quest.type)}</span>
            {showMinChapter && quest.minChapter ? (
              <span className="badge badge-ember">min. kap. {quest.minChapter}</span>
            ) : null}
            {progress?.completed ? (
              <span className="badge">Splnené</span>
            ) : null}
          </div>
          <h3 className="font-display text-xl text-moss-50">{quest.name}</h3>
          <p className="mt-1 text-sm text-mist-muted">{quest.description}</p>
          <p className="mt-2 text-xs text-mist-muted">
            Ciele: {formatTargets(quest.targets)} · {quest.amount}×
          </p>
        </div>
        <div className="text-right">
          <p className="points-mark text-sm text-lantern">+{quest.points}</p>
          <p className="text-xs text-mist-muted">bodov</p>
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
      </div>
    </article>
  );
}
