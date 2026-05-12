import type { InputMode, ProcessingMode, SupportedLanguage } from "@dictivo/shared";
import { Mic } from "lucide-react";
import { estimateWordCount } from "@dictivo/shared";
import type { HardwareProfile, PrivateFastModel, PrivateFastStatus, RunnableTiers, Tier } from "../lib/desktopBridge";
import { TierSelector } from "./TierSelector";

type DictationWorkbenchProps = {
  language: SupportedLanguage;
  selectedMode: InputMode;
  modeTemplates: ProcessingMode[];
  isDictating: boolean;
  liveText: string;
  rawText: string;
  hotkeyStatus: string;
  pasteStatus: string;
  privateFastStatus: PrivateFastStatus;
  hardwareProfile: HardwareProfile | null;
  selectedModel: PrivateFastModel | undefined;
  runnableTiers: RunnableTiers;
  selectedTier: Tier;
  onTierChange: (tier: Tier) => void;
  onModeChange: (mode: InputMode) => void;
  onToggleDictation: () => void;
  onLiveTextChange: (value: string) => void;
  onCopyRaw: () => void;
};

export function DictationWorkbench({
  language,
  selectedMode,
  modeTemplates,
  isDictating,
  liveText,
  hotkeyStatus,
  pasteStatus,
  privateFastStatus,
  hardwareProfile,
  selectedModel,
  runnableTiers,
  selectedTier,
  onTierChange,
  onModeChange,
  onToggleDictation,
  onLiveTextChange
}: DictationWorkbenchProps) {
  const activeMode = modeTemplates.find((mode) => mode.inputMode === selectedMode) ?? modeTemplates[0]!;
  const wordCount = estimateWordCount(liveText, language);
  const accel = hardwareProfile?.accelerators?.[0] ?? "CPU";
  const tierLabel = capitalize(selectedTier);
  const modelLabel = selectedModel?.label ?? privateFastStatus.modelName;

  return (
    <section className="dictation-workbench" aria-label="Local dictation workbench">
      <div className="signal-deck">
        <div className="mode-strip">
          <h2>{activeMode.label}</h2>
          <div className="segmented">
            {modeTemplates.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={selectedMode === mode.inputMode ? "is-selected" : ""}
                onClick={() => onModeChange(mode.inputMode)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`capture-stage ${isDictating ? "is-recording" : ""}`}>
          <button type="button" className="capture-orbit" onClick={onToggleDictation} aria-label={isDictating ? "Stop dictation" : "Start dictation"}>
            <Mic size={28} />
          </button>
          <textarea
            value={liveText}
            onChange={(event) => onLiveTextChange(event.target.value)}
            placeholder="Press your dictation hotkey, or click the mic to start."
            aria-label="Live dictation text"
          />
        </div>
      </div>

      <TierSelector tiers={runnableTiers} selected={selectedTier} onSelect={onTierChange} />

      <div className="workbench-footer">
        <span className="dot" />
        <span>{tierLabel} · {modelLabel} · {accel} · {hotkeyStatus}</span>
        <span className="privacy-tag">Transcript stays on this device {pasteStatus ? `· ${pasteStatus}` : ""} · {wordCount} words</span>
      </div>
    </section>
  );
}

function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
