import { Check, Cpu, Download, FolderInput, Gauge, HardDrive, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { HardwareProfile, PrivateFastModel, PrivateFastStatus } from "../lib/desktopBridge";
import type { ModelSelectionMode, PrivateFastProfile } from "../lib/settingsStore";

type ModelManagerProps = {
  status: PrivateFastStatus;
  models: PrivateFastModel[];
  hardwareProfile: HardwareProfile | null;
  operation: string;
  profile: PrivateFastProfile;
  selectionMode: ModelSelectionMode;
  onProfileChange: (profile: PrivateFastProfile) => void;
  onSelectionModeChange: (mode: ModelSelectionMode) => void;
  onModelAction: (action: "select" | "download" | "delete", modelId: string) => void;
  onImportModel: (modelId: string, sourcePath: string) => void;
  onRefresh: () => void;
};

export function ModelManager({
  status,
  models,
  hardwareProfile,
  operation,
  profile,
  selectionMode,
  onProfileChange,
  onSelectionModeChange,
  onModelAction,
  onImportModel,
  onRefresh
}: ModelManagerProps) {
  const [importModelId, setImportModelId] = useState("small");
  const [importPath, setImportPath] = useState("");
  const recommended = models.find((model) => model.id === hardwareProfile?.recommendedModelId);

  return (
    <div className="model-manager">
      <div className="engine-readout">
        <div>
          <span>Active model</span>
          <strong>{status.modelName}</strong>
        </div>
        <div>
          <span>CLI</span>
          <strong>{status.binaryPath ?? "whisper-cli missing"}</strong>
        </div>
        <div>
          <span>Hardware recommendation</span>
          <strong>
            {recommended?.label ?? hardwareProfile?.recommendedModelId ?? "checking"} · {hardwareProfile?.recommendedProfile ?? "balanced"}
          </strong>
        </div>
      </div>

      <div className="hardware-panel">
        <div>
          <Cpu size={18} />
          <span>{hardwareProfile ? `${hardwareProfile.platform} / ${hardwareProfile.arch}` : "Checking platform"}</span>
        </div>
        <div>
          <Gauge size={18} />
          <span>{hardwareProfile ? `${hardwareProfile.cpuCores} cores · ${hardwareProfile.performanceClass}` : "Checking CPU"}</span>
        </div>
        <div>
          <HardDrive size={18} />
          <span>{formatMemory(hardwareProfile?.memoryTotalBytes)}</span>
        </div>
        <p>{hardwareProfile?.reason ?? "Dictivo is reading local hardware signals to choose an engine profile."}</p>
      </div>

      <div className="setting-stack model-controls">
        <label>
          Model selection
          <select value={selectionMode} onChange={(event) => onSelectionModeChange(event.target.value as ModelSelectionMode)}>
            <option value="auto">Auto by local hardware</option>
            <option value="manual">Manual override</option>
          </select>
        </label>
        <label>
          Engine profile
          <select value={profile} onChange={(event) => onProfileChange(event.target.value as PrivateFastProfile)}>
            <option value="fast">Fast CPU fallback</option>
            <option value="balanced">Balanced local</option>
            <option value="quality">Quality local</option>
          </select>
        </label>
      </div>

      <div className="model-catalog">
        {models.map((model) => {
          const pending = operation.endsWith(`:${model.id}`);
          const isRecommended = hardwareProfile?.recommendedModelId === model.id;
          return (
            <article className={`model-row ${model.selected ? "is-selected" : ""} ${isRecommended ? "is-recommended" : ""}`} key={model.id}>
              <div className="model-main">
                <div className="model-title">
                  <strong>{model.label}</strong>
                  <span>{model.selected ? "Selected" : isRecommended ? "Recommended" : model.installed ? "Installed" : model.sizeLabel}</span>
                </div>
                <p>{model.useCase}</p>
                <div className="model-meta">
                  <span>{model.speed}</span>
                  <span>{model.quality}</span>
                  <span>{model.sizeLabel}</span>
                  {model.path && <span>{model.path}</span>}
                </div>
                <small>{model.notes}</small>
              </div>
              <div className="model-actions">
                {model.installed ? (
                  <>
                    <button
                      className="text-button"
                      disabled={model.selected || Boolean(operation)}
                      onClick={() => onModelAction("select", model.id)}
                    >
                      <Check size={16} />
                      {model.selected ? "Selected" : "Select"}
                    </button>
                    <button className="text-button" disabled={Boolean(operation)} onClick={() => onModelAction("delete", model.id)}>
                      <Trash2 size={16} />
                      {pending && operation.startsWith("delete:") ? "Deleting" : "Delete"}
                    </button>
                  </>
                ) : (
                  <button className="text-button" disabled={Boolean(operation)} onClick={() => onModelAction("download", model.id)}>
                    <Download size={16} />
                    {pending && operation.startsWith("download:") ? "Downloading" : "Download"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="import-row">
        <select value={importModelId} onChange={(event) => setImportModelId(event.target.value)}>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>
        <input value={importPath} onChange={(event) => setImportPath(event.target.value)} placeholder="/path/to/ggml-small.bin" />
        <button className="text-button" onClick={() => onImportModel(importModelId, importPath)}>
          <FolderInput size={16} />
          Import
        </button>
      </div>

      <div className="inline-actions">
        <button className="text-button" onClick={onRefresh}>
          <RotateCcw size={16} />
          Refresh
        </button>
      </div>
    </div>
  );
}

function formatMemory(bytes?: number) {
  if (!bytes) return "Memory unavailable";
  return `${Math.round(bytes / 1024 ** 3)} GB RAM`;
}
