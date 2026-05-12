import { Download, Trash2 } from "lucide-react";
import { useState } from "react";
import type { HardwareProfile, PrivateFastModel, PrivateFastStatus, RunnableTiers } from "../lib/desktopBridge";
import { rerunBenchmark } from "../lib/desktopBridge";

type ModelManagerProps = {
  status: PrivateFastStatus;
  models: PrivateFastModel[];
  hardwareProfile: HardwareProfile | null;
  runnableTiers: RunnableTiers;
  operation: string;
  onModelAction: (action: "select" | "download" | "delete", modelId: string) => void;
  onImportModel: (modelId: string, sourcePath: string) => void;
  onRefresh: () => void;
};

export function ModelManager({
  status,
  models,
  hardwareProfile,
  runnableTiers,
  operation,
  onModelAction,
  onImportModel,
  onRefresh
}: ModelManagerProps) {
  const [importModelId, setImportModelId] = useState("small");
  const [importPath, setImportPath] = useState("");

  const mediumModel = models.find((m) => m.id === runnableTiers.medium?.modelId);

  return (
    <div className="model-manager">
      <div className="recommend-card">
        <strong>Recommended for your hardware</strong>
        <div style={{ marginTop: 6 }}>
          {mediumModel?.label ?? hardwareProfile?.recommendedModelId ?? "—"}
          {hardwareProfile ? ` · ${hardwareProfile.cpuCores} cores · ${formatRam(hardwareProfile.memoryTotalBytes)}` : ""}
        </div>
        <button
          type="button"
          className="text-button"
          style={{ marginTop: 8 }}
          onClick={async () => { await rerunBenchmark(); onRefresh(); }}
        >
          Re-run setup
        </button>
      </div>

      <div className="tier-card-row">
        <TierCard
          name="Fast"
          subtitle="Lowest latency"
          assignment={runnableTiers.fast}
          models={models}
        />
        <TierCard
          name="Medium"
          subtitle="Recommended"
          assignment={runnableTiers.medium}
          models={models}
          isRecommended
        />
        <TierCard
          name="Slow"
          subtitle="Most accurate"
          assignment={runnableTiers.slow}
          models={models}
        />
      </div>

      <details className="advanced">
        <summary>Advanced — full model catalog</summary>
        <div className="model-catalog" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {models.map((model) => {
            const pending = operation.endsWith(`:${model.id}`);
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
                        {pending && operation.startsWith("delete:") ? "Deleting" : "Delete"}
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
                      {pending && operation.startsWith("download:") ? "Downloading" : "Download"}
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
              <option key={model.id} value={model.id}>{model.label}</option>
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
  name,
  subtitle,
  assignment,
  models,
  isRecommended
}: {
  name: string;
  subtitle: string;
  assignment: RunnableTiers["fast"];
  models: PrivateFastModel[];
  isRecommended?: boolean;
}) {
  if (!assignment) {
    return (
      <article className="tier-card" style={{ opacity: 0.55 }}>
        <div className="name">{name}</div>
        <div className="meta">Not available on this hardware</div>
      </article>
    );
  }
  const model = models.find((m) => m.id === assignment.modelId);
  return (
    <article className={`tier-card ${isRecommended ? "is-recommended" : ""}`}>
      <div className="name">{name}</div>
      <div className="meta">{subtitle}</div>
      <div className="meta">{model?.label ?? assignment.modelId} {model?.sizeLabel ? `· ${model.sizeLabel}` : ""}</div>
      {!assignment.downloaded && <div className="meta">Download on first use</div>}
    </article>
  );
}

function formatRam(bytes?: number) {
  if (!bytes) return "RAM unknown";
  return `${Math.round(bytes / 1024 ** 3)} GB RAM`;
}
