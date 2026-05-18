import type { TranscriptionLanguage } from "@dictivo/shared";
import { Mic, ShieldCheck, X as XIcon, Zap } from "lucide-react";
import { estimateWordCount, resolveTranscriptLanguage } from "@dictivo/shared";
import irisAvatarImage from "../assets/avatars/iris-companion.png";
import marcusAvatarImage from "../assets/avatars/marcus-companion.png";
import type {
  HardwareProfile,
  PrivateFastModel,
  PrivateFastStatus,
  RunnableTiers,
  Tier,
  TierAssignment
} from "../lib/desktopBridge";
import type { CompanionAvatar, CustomCompanionAvatar, HotkeySettings } from "../lib/settingsStore";
import type { CloudFastEntitlement } from "../lib/cloudFastEngine";
import { formatShortcutForDisplay } from "../lib/hotkeys";
import { TIER_DISPLAY } from "../lib/tierDisplay";
import type { TranscriptionMode } from "../lib/settingsStore";

type DictationWorkbenchProps = {
  language: TranscriptionLanguage;
  transcriptionMode: TranscriptionMode;
  cloudFastEntitlement: CloudFastEntitlement;
  isDictating: boolean;
  liveText: string;
  hotkeyStatus: string;
  pasteStatus: string;
  privateFastStatus: PrivateFastStatus;
  hardwareProfile: HardwareProfile | null;
  selectedModel: PrivateFastModel | undefined;
  runnableTiers: RunnableTiers;
  selectedTier: Tier;
  hotkeys: HotkeySettings;
  companionAvatar: CompanionAvatar;
  companionEnabled: boolean;
  customCompanionAvatar: CustomCompanionAvatar | null;
  onTranscriptionModeChange: (mode: TranscriptionMode) => void;
  onTierChange: (tier: Tier) => void;
  onUpgradeCloudFast: () => void;
  onToggleDictation: () => void;
  onLiveTextChange: (value: string) => void;
  onOpenHistory: () => void;
  onDisableCompanion: () => void;
};

export function DictationWorkbench({
  language,
  transcriptionMode,
  cloudFastEntitlement,
  isDictating,
  liveText,
  hotkeyStatus,
  pasteStatus,
  privateFastStatus,
  hardwareProfile,
  selectedModel,
  runnableTiers,
  selectedTier,
  hotkeys,
  companionAvatar,
  companionEnabled,
  customCompanionAvatar,
  onTranscriptionModeChange,
  onTierChange,
  onUpgradeCloudFast,
  onToggleDictation,
  onLiveTextChange,
  onOpenHistory,
  onDisableCompanion
}: DictationWorkbenchProps) {
  const wordCount = estimateWordCount(liveText, language);
  const effectiveLanguage = resolveTranscriptLanguage(language, liveText);
  const accel = hardwareProfile?.accelerators?.[0] ?? "CPU";
  const modelLabel = selectedModel?.label ?? privateFastStatus.modelName;
  const dictationShortcut = formatShortcutForDisplay(hotkeys.dictation, hardwareProfile?.platform);
  const pasteShortcut = formatShortcutForDisplay(hotkeys.pasteLast, hardwareProfile?.platform);
  const dictationAction = hotkeys.activationMode === "hold" ? "Hold and speak" : "Start / stop dictation";
  const countLabel = effectiveLanguage === "zh" || effectiveLanguage === "ja" ? "characters" : "words";
  const isCloudFast = transcriptionMode === "cloud-fast";
  const modeHeadline = isCloudFast
    ? cloudFastEntitlement.available ? "Cloud Fast is ready" : "Cloud Fast subscription required"
    : "Private Local is ready";
  const modeDetail = isCloudFast
    ? cloudFastEntitlement.available
      ? "Uploads audio for faster transcription."
      : "Subscribe to use faster cloud transcription."
    : "Audio stays on this device.";

  const availableTiers: Array<[Tier, TierAssignment]> = (["fast", "medium", "slow"] as const)
    .map((id) => [id, runnableTiers[id]] as [Tier, TierAssignment])
    .filter((pair) => pair[1].withinBudget);
  const showTierSelector = transcriptionMode === "local" && availableTiers.length > 0;

  return (
    <section className="dictation-workbench" aria-label="Local dictation workbench">
      <div className="signal-deck">
        <div className="suggestion-chips" aria-label="Quick tips">
          <span className="suggestion-chip"><span className="key" title={hotkeys.dictation}>{dictationShortcut}</span>{dictationAction}</span>
          <span className="suggestion-chip"><span className="key" title={hotkeys.pasteLast}>{pasteShortcut}</span>Paste last transcript</span>
          <button type="button" className="suggestion-chip suggestion-chip-button" onClick={onOpenHistory}>Resume from history</button>
        </div>

        <div className={`capture-stage capture-stage--${isCloudFast ? "cloud" : "local"} ${isDictating ? "is-recording" : ""}`}>
          <div className="engine-mode-selector" role="radiogroup" aria-label="Transcription mode">
            <button
              type="button"
              role="radio"
              aria-checked={transcriptionMode === "local"}
              className={`engine-mode-option engine-mode-option--local ${transcriptionMode === "local" ? "is-selected" : ""}`}
              onClick={() => onTranscriptionModeChange("local")}
            >
              <ShieldCheck size={15} />
              <span>
                <strong>Private Local</strong>
                <small>Audio stays here</small>
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={transcriptionMode === "cloud-fast"}
              className={`engine-mode-option engine-mode-option--cloud ${transcriptionMode === "cloud-fast" ? "is-selected" : ""}`}
              onClick={() => onTranscriptionModeChange("cloud-fast")}
            >
              <Zap size={15} />
              <span>
                <strong>Cloud Fast</strong>
                <small>Uploads for speed</small>
              </span>
            </button>
          </div>
          <button
            type="button"
            className="capture-orbit"
            onClick={onToggleDictation}
            aria-label={isDictating ? "Stop dictation" : "Start dictation"}
          >
            <Mic />
          </button>
          <div className="mode-promise" aria-live="polite">
            <strong>{modeHeadline}</strong>
            <span>{modeDetail}</span>
          </div>

          <div className="capture-hint-slot">
            {!liveText && (
              <div className="capture-hint">
                Tap the mic, or press <kbd title={hotkeys.dictation}>{dictationShortcut}</kbd>.
              </div>
            )}
          </div>
          <textarea
            value={liveText}
            onChange={(event) => onLiveTextChange(event.target.value)}
            placeholder="Your transcript will appear here."
            aria-label="Live dictation text"
          />


          <div className={`mode-tradeoff-card mode-tradeoff-card--${isCloudFast ? "cloud" : "local"}`}>
            <div className="mode-tradeoff-icon" aria-hidden="true">
              {isCloudFast ? <Zap size={15} /> : <ShieldCheck size={15} />}
            </div>
            <div>
              <strong>{isCloudFast ? "Fast when privacy is not required" : "Private by default"}</strong>
              <span>
                {isCloudFast
                  ? "Audio is uploaded to cloud transcription providers. Best for public content, casual notes, and low-latency dictation."
                  : "Your audio stays on this device. Best for meetings, private notes, and sensitive work."}
              </span>
            </div>
            {isCloudFast && !cloudFastEntitlement.available && (
              <button type="button" className="text-button" onClick={onUpgradeCloudFast}>
                Upgrade - $6.99/mo
              </button>
            )}
          </div>

          <div className={`tier-slot${showTierSelector ? "" : " tier-slot--reserved"}`} aria-hidden={showTierSelector ? undefined : true}>
            {showTierSelector && (
              <div className="tier-selector" role="radiogroup" aria-label="Engine tier">
                {availableTiers.map(([id]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selectedTier === id}
                    className={`tier-button ${selectedTier === id ? "is-selected" : ""}`}
                    onClick={() => onTierChange(id)}
                  >
                    <span className="name">{TIER_DISPLAY[id].name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="workbench-footer">
        <div className="meta-chips">
          <span className="meta-chip">
            <span className="dot" />
            {isCloudFast
              ? cloudFastEntitlement.available ? "Cloud Fast ready" : "Cloud Fast locked"
              : privateFastStatus.ready ? "Engine ready" : "Engine setup needed"}
          </span>
          <span className={`meta-chip meta-chip--${isCloudFast ? "cloud" : "private"}`}>
            {isCloudFast ? <Zap size={11} /> : <ShieldCheck size={11} />}
            {isCloudFast ? "Fast cloud" : "Private"}
          </span>
          {transcriptionMode === "local" && <span className="meta-chip">⚡ {accel}</span>}
          <span className="meta-chip">{isCloudFast ? "$6.99/mo" : modelLabel}</span>
        </div>
        <span>
          {wordCount} {countLabel} · {hotkeyStatus}
          {pasteStatus ? ` · ${pasteStatus}` : ""}
        </span>
      </div>

      {companionEnabled && (
        <CompanionPreview
          avatar={companionAvatar}
          customAvatar={customCompanionAvatar}
          isDictating={isDictating}
          hotkey={dictationShortcut}
          onDisable={onDisableCompanion}
        />
      )}
    </section>
  );
}

function CompanionPreview({
  avatar,
  customAvatar,
  isDictating,
  hotkey,
  onDisable
}: {
  avatar: CompanionAvatar;
  customAvatar: CustomCompanionAvatar | null;
  isDictating: boolean;
  hotkey: string;
  onDisable: () => void;
}) {
  return (
    <div className="companion-preview" aria-label="Floating companion preview">
      <div className="avatar">
        <AvatarGlyph avatar={avatar} customAvatar={customAvatar} />
      </div>
      <div>
        <div className="label">{isDictating ? "Recording" : "Standing by"}</div>
        <div className="duration">{hotkey}</div>
      </div>
      <button
        type="button"
        className="companion-preview-hide"
        title="Hide preview"
        aria-label="Hide preview"
        onClick={onDisable}
      >
        <XIcon size={11} />
      </button>
    </div>
  );
}

function AvatarGlyph({ avatar, customAvatar }: { avatar: CompanionAvatar; customAvatar: CustomCompanionAvatar | null }) {
  if (avatar === "custom" && customAvatar) {
    return <img src={customAvatar.dataUrl} alt="Custom companion avatar" draggable={false} />;
  }
  if (avatar === "cat") {
    return (
      <svg viewBox="0 0 96 96" role="img" aria-label="Cartoon cat">
        <path d="M24 35 18 13l22 14m32 8 6-22-22 14" fill="#5a6970" />
        <circle cx="48" cy="52" r="31" fill="#7f9299" />
        <circle cx="36" cy="48" r="4" fill="#0b1112" />
        <circle cx="60" cy="48" r="4" fill="#0b1112" />
        <path d="M43 56h10l-5 6z" fill="#ffb7c5" />
        <path d="M48 61v7" stroke="#0b1112" strokeWidth="3" strokeLinecap="round" />
        <path d="M32 60h-16m48 0h16M34 66H18m44 0h16" stroke="#e6f5f2" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  if (avatar === "iris") return <img src={irisAvatarImage} alt="Iris companion" draggable={false} />;
  if (avatar === "marcus") return <img src={marcusAvatarImage} alt="Marcus companion" draggable={false} />;
  return (
    <svg viewBox="0 0 96 96" role="img" aria-label="Cartoon dog">
      <circle cx="48" cy="52" r="31" fill="#d89954" />
      <path d="M23 42c-6-11-3-23 7-26 8 3 12 12 10 25z" fill="#734729" />
      <path d="M73 42c6-11 3-23-7-26-8 3-12 12-10 25z" fill="#734729" />
      <circle cx="36" cy="48" r="4" fill="#1a1210" />
      <circle cx="60" cy="48" r="4" fill="#1a1210" />
      <path d="M42 59c4 3 8 3 12 0" fill="none" stroke="#1a1210" strokeWidth="4" strokeLinecap="round" />
      <path d="M43 54h10l-5 6z" fill="#1a1210" />
      <path d="M26 69c13 13 31 13 44 0" fill="none" stroke="#f2ca89" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}
