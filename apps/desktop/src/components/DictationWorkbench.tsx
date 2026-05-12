import type { InputMode, ProcessingMode, SupportedLanguage } from "@dictivo/shared";
import { Mic, X as XIcon } from "lucide-react";
import { estimateWordCount } from "@dictivo/shared";
import trumpAvatarImage from "../assets/avatars/trump-companion.png";
import bikiniAvatarImage from "../assets/avatars/bikini-companion.png";
import muscleAvatarImage from "../assets/avatars/muscle-companion.png";
import type {
  HardwareProfile,
  PrivateFastModel,
  PrivateFastStatus,
  RunnableTiers,
  Tier,
  TierAssignment
} from "../lib/desktopBridge";
import type { CompanionAvatar } from "../lib/settingsStore";

type DictationWorkbenchProps = {
  language: SupportedLanguage;
  selectedMode: InputMode;
  modeTemplates: ProcessingMode[];
  isDictating: boolean;
  liveText: string;
  hotkeyStatus: string;
  pasteStatus: string;
  privateFastStatus: PrivateFastStatus;
  hardwareProfile: HardwareProfile | null;
  selectedModel: PrivateFastModel | undefined;
  runnableTiers: RunnableTiers;
  selectedTier: Tier;
  companionAvatar: CompanionAvatar;
  companionEnabled: boolean;
  onTierChange: (tier: Tier) => void;
  onModeChange: (mode: InputMode) => void;
  onToggleDictation: () => void;
  onLiveTextChange: (value: string) => void;
};

const TIER_META: Record<Tier, { name: string }> = {
  fast: { name: "Fast" },
  medium: { name: "Medium" },
  slow: { name: "Slow" }
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
  companionAvatar,
  companionEnabled,
  onTierChange,
  onModeChange,
  onToggleDictation,
  onLiveTextChange
}: DictationWorkbenchProps) {
  const activeMode = modeTemplates.find((mode) => mode.inputMode === selectedMode) ?? modeTemplates[0]!;
  const wordCount = estimateWordCount(liveText, language);
  const accel = hardwareProfile?.accelerators?.[0] ?? "CPU";
  const modelLabel = selectedModel?.label ?? privateFastStatus.modelName;

  const availableTiers: Array<[Tier, TierAssignment]> = (["fast", "medium", "slow"] as const)
    .map((id) => [id, runnableTiers[id]] as [Tier, TierAssignment | null])
    .filter((pair): pair is [Tier, TierAssignment] => pair[1] !== null);

  return (
    <section className="dictation-workbench" aria-label="Local dictation workbench">
      <div className="signal-deck">
        <div className="suggestion-chips" aria-label="Quick tips">
          <span className="suggestion-chip"><span className="key">⌥Space</span>Hold and speak</span>
          <span className="suggestion-chip"><span className="key">⌥⇧V</span>Paste last transcript</span>
          <span className="suggestion-chip">Resume from history…</span>
        </div>

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
          <button
            type="button"
            className="capture-orbit"
            onClick={onToggleDictation}
            aria-label={isDictating ? "Stop dictation" : "Start dictation"}
          >
            <Mic />
          </button>

          {!liveText && (
            <div className="capture-hint">
              Tap the mic, or press <kbd>⌥</kbd><kbd>Space</kbd>.
            </div>
          )}
          <textarea
            value={liveText}
            onChange={(event) => onLiveTextChange(event.target.value)}
            placeholder="Your transcript will appear here."
            aria-label="Live dictation text"
          />


          {availableTiers.length > 0 && (
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
                  <span className="name">{TIER_META[id].name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="workbench-footer">
        <div className="meta-chips">
          <span className="meta-chip">
            <span className="dot" />
            {privateFastStatus.ready ? "Engine ready" : "Engine setup needed"}
          </span>
          <span className="meta-chip">⚡ {accel}</span>
          <span className="meta-chip">{modelLabel}</span>
        </div>
        <span>
          {wordCount} words · {hotkeyStatus}
          {pasteStatus ? ` · ${pasteStatus}` : ""}
        </span>
      </div>

      {companionEnabled && (
        <CompanionPreview avatar={companionAvatar} isDictating={isDictating} />
      )}
    </section>
  );
}

function CompanionPreview({ avatar, isDictating }: { avatar: CompanionAvatar; isDictating: boolean }) {
  return (
    <div className="companion-preview" aria-hidden="true">
      <div className="avatar">
        <AvatarGlyph avatar={avatar} />
      </div>
      <div>
        <div className="label">{isDictating ? "Recording" : "Standing by"}</div>
        <div className="duration">⌥+Space</div>
      </div>
      <button
        type="button"
        title="Hide preview"
        aria-label="Hide preview"
        style={{
          marginLeft: 4,
          width: 18,
          height: 18,
          borderRadius: 999,
          background: "transparent",
          border: 0,
          color: "var(--faint)",
          display: "grid",
          placeItems: "center",
          opacity: 0.5
        }}
        onClick={(event) => {
          event.currentTarget.parentElement?.remove();
        }}
      >
        <XIcon size={11} />
      </button>
    </div>
  );
}

function AvatarGlyph({ avatar }: { avatar: CompanionAvatar }) {
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
  if (avatar === "trump") return <img src={trumpAvatarImage} alt="Cartoon Trump" draggable={false} />;
  if (avatar === "bikini") return <img src={bikiniAvatarImage} alt="Bikini companion" draggable={false} />;
  if (avatar === "muscle") return <img src={muscleAvatarImage} alt="Muscle companion" draggable={false} />;
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
