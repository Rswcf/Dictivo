import type { InputMode, ProcessingMode, SupportedLanguage } from "@dictivo/shared";
import { Activity, Check, Cpu, Gauge, HardDrive, Mic, Pause, Play, Radar, Zap } from "lucide-react";
import { estimateWordCount } from "@dictivo/shared";
import type { ReactNode } from "react";
import type { HardwareProfile, PrivateFastModel, PrivateFastStatus } from "../lib/desktopBridge";
import type { PrivateFastProfile } from "../lib/settingsStore";
import { IconButton } from "./IconButton";

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
  privateFastProfile: PrivateFastProfile;
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
  rawText,
  hotkeyStatus,
  pasteStatus,
  privateFastStatus,
  hardwareProfile,
  selectedModel,
  privateFastProfile,
  onModeChange,
  onToggleDictation,
  onLiveTextChange,
  onCopyRaw
}: DictationWorkbenchProps) {
  const activeMode = modeTemplates.find((mode) => mode.inputMode === selectedMode) ?? modeTemplates[0]!;
  const wordCount = estimateWordCount(liveText, language);
  const acceleration = hardwareProfile?.accelerators.length ? hardwareProfile.accelerators.join(" + ") : "CPU";

  return (
    <section className="dictation-workbench" aria-label="Local dictation workbench">
      <div className="signal-deck">
        <div className="mode-strip">
          <div>
            <p className="eyebrow">Local Dictation</p>
            <h2>{activeMode.label}</h2>
          </div>
          <div className="segmented">
            {modeTemplates.map((mode) => (
              <button
                key={mode.id}
                className={selectedMode === mode.inputMode ? "is-selected" : ""}
                onClick={() => onModeChange(mode.inputMode)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`capture-stage ${isDictating ? "is-recording" : ""}`}>
          <div className="signal-column" aria-hidden="true">
            <div className="capture-orbit">
              <Mic size={38} />
              <span />
              <span />
              <span />
            </div>
            <div className="level-bars">
              {Array.from({ length: 18 }, (_, index) => (
                <i key={index} style={{ animationDelay: `${index * 54}ms` }} />
              ))}
            </div>
          </div>

          <textarea
            value={liveText}
            onChange={(event) => onLiveTextChange(event.target.value)}
            placeholder="Press your dictation hotkey or start the local engine..."
            aria-label="Live dictation text"
          />
        </div>

        {rawText && rawText !== liveText && (
          <div className="raw-preview">
            <div>
              <span>Raw local transcript</span>
              <button className="text-button" onClick={onCopyRaw}>
                <Check size={16} />
                Copy raw
              </button>
            </div>
            <p>{rawText}</p>
          </div>
        )}
      </div>

      <aside className="engine-panel" aria-label="Local engine status">
        <div className="engine-header">
          <div>
            <p className="eyebrow">Private Compute</p>
            <h2>{privateFastStatus.ready ? "Engine armed" : "Engine setup required"}</h2>
          </div>
          <IconButton label={isDictating ? "Stop dictation" : "Start dictation"} tone={isDictating ? "danger" : "primary"} onClick={onToggleDictation}>
            {isDictating ? <Pause size={22} /> : <Play size={22} />}
          </IconButton>
        </div>

        <p className="mode-instruction">{activeMode.instruction}</p>

        <div className="telemetry-grid">
          <Metric icon={<Radar size={16} />} label="Words" value={wordCount.toString()} />
          <Metric icon={<Gauge size={16} />} label="Profile" value={privateFastProfile} />
          <Metric icon={<HardDrive size={16} />} label="Model" value={selectedModel?.label ?? privateFastStatus.modelName} />
          <Metric icon={<Zap size={16} />} label="Accel" value={acceleration} />
          <Metric icon={<Cpu size={16} />} label="Hardware" value={hardwareProfile?.performanceClass ?? "checking"} />
          <Metric icon={<Activity size={16} />} label="Hotkey" value={hotkeyStatus} />
        </div>

        <div className="engine-readout">
          <div>
            <span>Local status</span>
            <strong>{privateFastStatus.message}</strong>
          </div>
          <div>
            <span>Paste path</span>
            <strong>{pasteStatus || "Waiting for first dictation"}</strong>
          </div>
          <div>
            <span>Retention</span>
            <strong>Audio and text stay on this device</strong>
          </div>
        </div>
      </aside>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      <span>
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}
