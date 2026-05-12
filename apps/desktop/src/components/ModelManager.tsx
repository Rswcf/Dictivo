import { Download, Trash2 } from "lucide-react";
import { useState } from "react";
import type {
  HardwareProfile,
  PrivateFastModel,
  PrivateFastStatus,
  RunnableTiers,
  Tier,
  TierAssignment
} from "../lib/desktopBridge";
import { TIER_DISPLAY } from "../lib/tierDisplay";

type RerunStatus = "idle" | "measuring" | "error";

type ModelManagerProps = {
  status: PrivateFastStatus;
  models: PrivateFastModel[];
  hardwareProfile: HardwareProfile | null;
  runnableTiers: RunnableTiers;
  operation: string;
  selectedTier: Tier;
  rerunStatus: RerunStatus;
  rerunError: string;
  onModelAction: (action: "select" | "download" | "delete", modelId: string) => void;
  onImportModel: (modelId: string, sourcePath: string) => void;
  onRefresh: () => void;
  onTierChange: (tier: Tier) => void;
  onRerunBenchmark: () => void;
  onOpenWizard: () => void;
};

type PendingConfirm =
  | { kind: "download"; tier: Tier; assignment: TierAssignment }
  | { kind: "warning"; tier: Tier; assignment: TierAssignment }
  | null;

export function ModelManager({
  status,
  models,
  hardwareProfile,
  runnableTiers,
  operation,
  selectedTier,
  rerunStatus,
  rerunError,
  onModelAction,
  onImportModel,
  onTierChange,
  onRerunBenchmark,
  onOpenWizard
}: ModelManagerProps) {
  const [importModelId, setImportModelId] = useState("small");
  const [importPath, setImportPath] = useState("");
  const [pending, setPending] = useState<PendingConfirm>(null);

  const mediumModel = models.find((m) => m.id === runnableTiers.medium.modelId);

  const handleTierCardClick = (tier: Tier) => {
    const assignment = runnableTiers[tier];
    if (tier === selectedTier && assignment.downloaded) return;
    if (!assignment.withinBudget) {
      setPending({ kind: "warning", tier, assignment });
      return;
    }
    if (!assignment.downloaded) {
      setPending({ kind: "download", tier, assignment });
      return;
    }
    onTierChange(tier);
  };

  const handleConfirm = () => {
    if (!pending) return;
    onTierChange(pending.tier);
    setPending(null);
  };

  return (
    <div className="model-manager">
      <div className="recommend-card">
        <strong>Recommended for your hardware</strong>
        <div style={{ marginTop: 6 }}>
          {mediumModel?.label ?? hardwareProfile?.recommendedModelId ?? "—"}
          {hardwareProfile
            ? ` · ${hardwareProfile.cpuCores} cores · ${formatRam(hardwareProfile.memoryTotalBytes)}`
            : ""}
        </div>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className={`text-button rerun-button ${rerunStatus === "measuring" ? "is-measuring" : ""}`}
            disabled={rerunStatus === "measuring"}
            onClick={onRerunBenchmark}
          >
            {rerunStatus === "measuring" ? "Measuring…" : "Re-run setup"}
          </button>
          <button type="button" className="text-button-link" onClick={onOpenWizard}>
            Run setup wizard instead →
          </button>
        </div>
        {rerunStatus === "error" && rerunError && (
          <div className="rerun-error" role="alert">{rerunError}</div>
        )}
      </div>

      {pending && (
        <ConfirmInline
          title={
            pending.kind === "warning"
              ? `${TIER_DISPLAY[pending.tier].name} may run slowly`
              : `Download ${TIER_DISPLAY[pending.tier].name}?`
          }
          body={
            pending.kind === "warning"
              ? `${pending.assignment.modelId} could take roughly ${pending.assignment.realtimeFactor.toFixed(1)}× realtime on your hardware. 30 seconds of audio may take ${Math.round(
                  pending.assignment.realtimeFactor * 30
                )} seconds or more. Continue?`
              : `This tier needs ${pending.assignment.modelId} (${
                  models.find((m) => m.id === pending.assignment.modelId)?.sizeLabel ?? "size unknown"
                }). Download and switch?`
          }
          confirmLabel={pending.kind === "warning" ? "Continue" : "Download"}
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}

      <div className="tier-card-row">
        {(["fast", "medium", "slow"] as const).map((tier) => (
          <TierCard
            key={tier}
            tier={tier}
            assignment={runnableTiers[tier]}
            model={models.find((m) => m.id === runnableTiers[tier].modelId)}
            isSelected={selectedTier === tier}
            isBusy={Boolean(operation) && operation.endsWith(`:${runnableTiers[tier].modelId}`)}
            onClick={() => handleTierCardClick(tier)}
          />
        ))}
      </div>

      <details className="advanced">
        <summary>Advanced — full model catalog</summary>
        <div className="model-catalog" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {models.map((model) => {
            const pendingOp = operation.endsWith(`:${model.id}`);
            return (
              <article className={`tier-card ${model.selected ? "is-recommended" : ""}`} key={model.id}>
                <div className="name">{model.label}</div>
                <div className="meta">
                  {model.installed ? "Installed" : model.sizeLabel}
                  {model.selected ? " · Selected" : ""}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  {model.installed ? (
                    <>
                      <button
                        type="button"
                        className="text-button"
                        disabled={model.selected || Boolean(operation)}
                        onClick={() => onModelAction("select", model.id)}
                      >
                        {model.selected ? "Selected" : "Select"}
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        disabled={Boolean(operation)}
                        onClick={() => onModelAction("delete", model.id)}
                      >
                        <Trash2 size={13} />
                        {pendingOp && operation.startsWith("delete:") ? "Deleting" : "Delete"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="text-button"
                      disabled={Boolean(operation)}
                      onClick={() => onModelAction("download", model.id)}
                    >
                      <Download size={13} />
                      {pendingOp && operation.startsWith("download:") ? "Downloading" : "Download"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 12 }}>
          <select value={importModelId} onChange={(event) => setImportModelId(event.target.value)}>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
          <input
            value={importPath}
            onChange={(event) => setImportPath(event.target.value)}
            placeholder="/path/to/ggml-small.bin"
          />
          <button type="button" className="text-button" onClick={() => onImportModel(importModelId, importPath)}>
            Import
          </button>
        </div>
      </details>

      <small style={{ color: "var(--faint)", fontSize: 11 }}>{status.message}</small>
    </div>
  );
}

function TierCard({
  tier,
  assignment,
  model,
  isSelected,
  isBusy,
  onClick
}: {
  tier: Tier;
  assignment: TierAssignment;
  model: PrivateFastModel | undefined;
  isSelected: boolean;
  isBusy: boolean;
  onClick: () => void;
}) {
  const display = TIER_DISPLAY[tier];
  const stateClasses = [
    "tier-card",
    isSelected ? "is-active" : "",
    !assignment.withinBudget ? "is-out-of-budget" : "",
    isBusy ? "is-downloading" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={stateClasses}
      onClick={onClick}
      aria-pressed={isSelected}
      aria-label={`${display.name} tier — ${display.sub}`}
    >
      <div className="name">{display.name}</div>
      <div className="meta">{display.sub}</div>
      <div className="meta">
        {model?.label ?? assignment.modelId}
        {model?.sizeLabel ? ` · ${model.sizeLabel}` : ""}
      </div>
      {isSelected && (
        <span className="active-badge" aria-hidden="true">● Active</span>
      )}
      {!isSelected && !assignment.downloaded && assignment.withinBudget && (
        <span className="download-hint" aria-hidden="true">↓ Download</span>
      )}
      {!assignment.withinBudget && (
        <span className="warning-hint" aria-hidden="true">⚠ may be slow</span>
      )}
      {isBusy && (
        <span className="busy-overlay" aria-hidden="true">Downloading…</span>
      )}
    </button>
  );
}

function ConfirmInline({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="inline-confirm" role="dialog" aria-label={title}>
      <strong>{title}</strong>
      <p>{body}</p>
      <div className="inline-confirm-actions">
        <button type="button" className="text-button" onClick={onCancel}>Cancel</button>
        <button type="button" className="text-button primary" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  );
}

function formatRam(bytes?: number) {
  if (!bytes) return "RAM unknown";
  return `${Math.round(bytes / 1024 ** 3)} GB RAM`;
}
