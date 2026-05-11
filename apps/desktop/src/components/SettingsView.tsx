import { Bot, Cat, ClipboardCheck, Dog, Keyboard, KeyRound, Lock, Mic2, RefreshCw, ShieldCheck, SlidersHorizontal, Sparkles, UserRound, WifiOff } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import trumpAvatarImage from "../assets/avatars/trump-companion.png";
import type { HardwareProfile, PrivateFastModel, PrivateFastStatus } from "../lib/desktopBridge";
import type {
  CompanionAvatar,
  HotkeySettings,
  LocalProcessingSettings,
  ModelSelectionMode,
  PrivateFastProfile
} from "../lib/settingsStore";
import { ModelManager } from "./ModelManager";

type SettingsSection = "engine" | "hotkeys" | "processing" | "companion" | "privacy";

type SettingsViewProps = {
  hotkeys: HotkeySettings;
  localProcessing: LocalProcessingSettings;
  permissions: Record<string, string>;
  privateFastStatus: PrivateFastStatus;
  privateFastModels: PrivateFastModel[];
  privateFastOperation: string;
  privateFastProfile: PrivateFastProfile;
  modelSelectionMode: ModelSelectionMode;
  companionEnabled: boolean;
  companionAvatar: CompanionAvatar;
  hardwareProfile: HardwareProfile | null;
  onHotkeyChange: (key: keyof HotkeySettings, value: string) => void;
  onProcessingChange: (key: keyof LocalProcessingSettings, value: boolean) => void;
  onProfileChange: (profile: PrivateFastProfile) => void;
  onSelectionModeChange: (mode: ModelSelectionMode) => void;
  onCompanionEnabledChange: (enabled: boolean) => void;
  onCompanionAvatarChange: (avatar: CompanionAvatar) => void;
  onModelAction: (action: "select" | "download" | "delete", modelId: string) => void;
  onImportModel: (modelId: string, sourcePath: string) => void;
  onRefreshNative: () => void;
};

const sections: Array<{ id: SettingsSection; label: string; icon: ReactNode }> = [
  { id: "engine", label: "Local Engine", icon: <WifiOff size={16} /> },
  { id: "hotkeys", label: "Hotkeys", icon: <KeyRound size={16} /> },
  { id: "processing", label: "Processing", icon: <Sparkles size={16} /> },
  { id: "companion", label: "Companion", icon: <Bot size={16} /> },
  { id: "privacy", label: "Privacy", icon: <Lock size={16} /> }
];

const avatars: Array<{ id: CompanionAvatar; label: string; icon: ReactNode; image?: string }> = [
  { id: "dog", label: "Dog", icon: <Dog size={18} /> },
  { id: "cat", label: "Cat", icon: <Cat size={18} /> },
  { id: "trump", label: "Trump", icon: <UserRound size={18} />, image: trumpAvatarImage }
];

type PermissionTone = "ready" | "attention" | "neutral";

type PermissionDisplayStatus = {
  label: string;
  detail: string;
  tone: PermissionTone;
};

export const privacyPermissionItems: Array<{
  key: "microphone" | "accessibility" | "pasteAutomation";
  label: string;
  requirement: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    key: "microphone",
    label: "Microphone",
    requirement: "Required",
    description: "Records dictation audio so the local engine can transcribe it on this computer.",
    icon: <Mic2 size={17} />
  },
  {
    key: "accessibility",
    label: "Accessibility",
    requirement: "Recommended",
    description: "Allows Dictivo to control paste behavior and keep global dictation shortcuts reliable.",
    icon: <Keyboard size={17} />
  },
  {
    key: "pasteAutomation",
    label: "Auto paste",
    requirement: "Optional",
    description: "Places the final transcript into the active app. If unavailable, the transcript stays available in Dictivo.",
    icon: <ClipboardCheck size={17} />
  }
];

export function describePermissionStatus(value?: string): PermissionDisplayStatus {
  switch (value) {
    case "granted":
      return {
        label: "Ready",
        detail: "The operating system reports this permission as available.",
        tone: "ready"
      };
    case "clipboard-only":
      return {
        label: "Copy only",
        detail: "Dictivo can copy locally, but direct paste automation is not available here.",
        tone: "neutral"
      };
    case "web-preview":
      return {
        label: "Preview only",
        detail: "This status is from the browser preview, not the installed desktop app.",
        tone: "neutral"
      };
    case "denied":
    case "blocked":
      return {
        label: "Needs permission",
        detail: "Enable this permission in system settings before using the related workflow.",
        tone: "attention"
      };
    case "pending-native-prompt":
    case "not-determined":
    case undefined:
      return {
        label: "Needs system check",
        detail: "Dictivo has not received a confirmed system permission state yet.",
        tone: "attention"
      };
    default:
      return {
        label: "Not verified",
        detail: "Refresh local status after granting permissions in system settings.",
        tone: "neutral"
      };
  }
}

export function SettingsView({
  hotkeys,
  localProcessing,
  permissions,
  privateFastStatus,
  privateFastModels,
  privateFastOperation,
  privateFastProfile,
  modelSelectionMode,
  companionEnabled,
  companionAvatar,
  hardwareProfile,
  onHotkeyChange,
  onProcessingChange,
  onProfileChange,
  onSelectionModeChange,
  onCompanionEnabledChange,
  onCompanionAvatarChange,
  onModelAction,
  onImportModel,
  onRefreshNative
}: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>("engine");

  return (
    <section className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections">
        {sections.map((item) => (
          <button key={item.id} className={section === item.id ? "is-selected" : ""} onClick={() => setSection(item.id)}>
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      <div className="settings-content">
        {section === "engine" && (
          <div className="side-panel private-fast-panel">
            <PanelTitle icon={<WifiOff size={18} />} title="Local Engine" />
            <p className="mode-instruction">{privateFastStatus.message}</p>
            <ModelManager
              status={privateFastStatus}
              models={privateFastModels}
              hardwareProfile={hardwareProfile}
              operation={privateFastOperation}
              profile={privateFastProfile}
              selectionMode={modelSelectionMode}
              onProfileChange={onProfileChange}
              onSelectionModeChange={onSelectionModeChange}
              onModelAction={onModelAction}
              onImportModel={onImportModel}
              onRefresh={onRefreshNative}
            />
          </div>
        )}

        {section === "hotkeys" && (
          <div className="side-panel">
            <PanelTitle icon={<KeyRound size={18} />} title="Hotkeys" />
            <p className="mode-instruction">Global shortcuts are shared across macOS and Windows through the native bridge.</p>
            <div className="hotkey-grid">
              <ShortcutRecorder label="Dictation" value={hotkeys.dictation} onChange={(value) => onHotkeyChange("dictation", value)} />
              <ShortcutRecorder label="Paste Last" value={hotkeys.pasteLast} onChange={(value) => onHotkeyChange("pasteLast", value)} />
            </div>
            <div className="setting-stack">
              <label>
                Dictation activation
                <select value={hotkeys.activationMode} onChange={(event) => onHotkeyChange("activationMode", event.target.value)}>
                  <option value="toggle">Toggle</option>
                  <option value="hold">Press and hold</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {section === "processing" && (
          <div className="side-panel">
            <PanelTitle icon={<SlidersHorizontal size={18} />} title="Local Processing" />
            <div className="toggle-list">
              <ToggleRow label="Auto polish" checked={localProcessing.autoPolish} onChange={(value) => onProcessingChange("autoPolish", value)} />
              <ToggleRow label="Spoken punctuation" checked={localProcessing.spokenPunctuation} onChange={(value) => onProcessingChange("spokenPunctuation", value)} />
              <ToggleRow label="Remove fillers" checked={localProcessing.fillerWords} onChange={(value) => onProcessingChange("fillerWords", value)} />
              <ToggleRow label="Smart capitalization" checked={localProcessing.smartCapitalization} onChange={(value) => onProcessingChange("smartCapitalization", value)} />
            </div>
          </div>
        )}

        {section === "companion" && (
          <div className="side-panel">
            <PanelTitle icon={<Bot size={18} />} title="Floating Companion" />
            <p className="mode-instruction">A small always-on-top window mirrors recording, processing, completion, and setup states outside the main window.</p>
            <div className="toggle-list">
              <ToggleRow label="Show floating companion" checked={companionEnabled} onChange={onCompanionEnabledChange} />
            </div>
            <div className="avatar-picker" aria-label="Companion avatar">
              {avatars.map((avatar) => (
                <button
                  key={avatar.id}
                  className={companionAvatar === avatar.id ? "is-selected" : ""}
                  onClick={() => onCompanionAvatarChange(avatar.id)}
                  type="button"
                >
                  <span className={`avatar-chip avatar-chip--${avatar.id}`}>
                    {avatar.image ? <img src={avatar.image} alt="" draggable={false} /> : avatar.icon}
                  </span>
                  <strong>{avatar.label}</strong>
                </button>
              ))}
            </div>
          </div>
        )}

        {section === "privacy" && (
          <div className="side-panel">
            <PanelTitle icon={<Lock size={18} />} title="Permissions & Privacy" />
            <div className="privacy-pledge">
              <ShieldCheck size={18} />
              <div>
                <strong>Local-only by design</strong>
                <p>Dictivo does not send audio, text, dictionary terms, snippets, or transcripts to external AI providers.</p>
              </div>
            </div>
            <div className="permission-list permission-list--explained">
              {privacyPermissionItems.map((item) => {
                const status = describePermissionStatus(permissions[item.key]);
                return (
                  <article key={item.key} className={`permission-card is-${status.tone}`}>
                    <span className="permission-card__icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <div className="permission-card__body">
                      <div className="permission-card__heading">
                        <strong>{item.label}</strong>
                        <span>{item.requirement}</span>
                      </div>
                      <p>{item.description}</p>
                      <small>{status.detail}</small>
                    </div>
                    <span className={`permission-status is-${status.tone}`}>{status.label}</span>
                  </article>
                );
              })}
            </div>
            <button className="text-button" onClick={onRefreshNative}>
              <RefreshCw size={15} />
              Refresh local status
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function ShortcutRecorder({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setRecording(false);
        return;
      }

      const shortcut = eventToShortcut(event);
      if (!shortcut) return;
      onChange(shortcut);
      setRecording(false);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onChange, recording]);

  return (
    <div className="hotkey-row">
      <div>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
      <button className={`text-button ${recording ? "is-recording-shortcut" : ""}`} onClick={() => setRecording(true)}>
        {recording ? "Press keys..." : "Change"}
      </button>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function eventToShortcut(event: KeyboardEvent) {
  const key = normalizedShortcutKey(event.key);
  if (!key) return "";
  const modifiers = [];
  if (event.metaKey || event.ctrlKey) modifiers.push("CommandOrControl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  return [...modifiers, key].join("+");
}

function normalizedShortcutKey(key: string) {
  if (["Meta", "Control", "Alt", "Shift"].includes(key)) return "";
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}
