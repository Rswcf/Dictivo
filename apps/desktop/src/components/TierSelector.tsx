import type { RunnableTiers, Tier, TierAssignment } from "../lib/desktopBridge";

type TierSelectorProps = {
  tiers: RunnableTiers;
  selected: Tier;
  onSelect: (tier: Tier) => void;
};

const TIER_META: Record<Tier, { label: string; sub: string }> = {
  fast: { label: "Fast", sub: "Lowest latency" },
  medium: { label: "Medium", sub: "Recommended" },
  slow: { label: "Slow", sub: "Most accurate" }
};

export function TierSelector({ tiers, selected, onSelect }: TierSelectorProps) {
  const entries: Array<[Tier, TierAssignment]> = (["fast", "medium", "slow"] as const)
    .map((id) => [id, tiers[id]] as [Tier, TierAssignment | null])
    .filter((pair): pair is [Tier, TierAssignment] => pair[1] !== null);

  return (
    <div className="tier-selector" role="radiogroup" aria-label="Engine tier">
      {entries.map(([id, assignment]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={selected === id}
          className={`tier-button ${selected === id ? "is-selected" : ""}`}
          onClick={() => onSelect(id)}
        >
          <span className="name">{TIER_META[id].label}</span>
          <span className="sub">
            {TIER_META[id].sub}
            {assignment.predicted ? " · predicted" : ""}
          </span>
        </button>
      ))}
    </div>
  );
}
