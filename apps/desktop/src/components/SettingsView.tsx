import { Bot, ClipboardCheck, Cat, Dog, Keyboard, KeyRound, Lock, Mic2, RefreshCw, ShieldCheck, UserRound, WifiOff } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import trumpAvatarImage from "../assets/avatars/trump-companion.png";
import type { HardwareProfile, PrivateFastModel, PrivateFastStatus, RunnableTiers } from "../lib/desktopBridge";
import type { CompanionAvatar, HotkeySettings, LocalProcessingSettings } from "../lib/settingsStore";
import { ModelManager } from "./ModelManager";

type SettingsSection = "engine" | "hotkeys" | "companion" | "privacy";

type SettingsViewProps = {
  hotkeys: HotkeySettings;
  localProcessing: LocalProcessingSettings;
  permissions: Record<string, string>;
  privateFastStatus: PrivateFastStatus;
  privateFastModels: PrivateFastModel[];
  privateFastOperation: string;
  runnableTiers: RunnableTiers;
  companionEnabled: boolean;
  companionAvatar: CompanionAvatar;
  hardwareProfile: HardwareProfile | null;
  onHotkeyChange: (key: keyof HotkeySettings, value: string) => void;
  onProcessingChange: (key: keyof LocalProcessingSettings, value: boolean) => void;
  onCompanionEnabledChange: (enabled: boolean) => void;
  onCompanionAvatarChange: (avatar: CompanionAvatar) => void;
  onModelAction: (action: "select" | "download" | "delete", modelId: string) => void;
  onImportModel: (modelId: string, sourcePath: string) => void;
  onRefreshNative: () => void;
  initialSection?: SettingsSection;
};

const sections: Array<{ id: SettingsSection; label: string; icon: ReactNode }> = [
  { id: "engine", label: "Local Engine", icon: <WifiOff size={14} /> },
  { id: "hotkeys", label: "Hotkeys", icon: <KeyRound size={14} /> },
  { id: "companion", label: "Companion", icon: <Bot size={14} /> },
  { id: "privacy", label: "Privacy", icon: <Lock size={14} /> }
];

const avatars: Array<{ id: CompanionAvatar; label: string; icon: ReactNode; image?: string }> = [
  { id: "dog", label: "Dog", icon: <Dog size={18} /> },
  { id: "cat", label: "Cat", icon: <Cat size={18} /> },
  { id: "trump", label: "Trump", icon: <UserRound size={18} />, image: trumpAvatarImage }
];

export const privacyPermissionItems: Array<{
  key: "microphone" | "accessibility" | "pasteAutomation";
  label: string;
  requirement: string;
  description: string;
  icon: ReactNode;
}> = [
  { key: "microphone", label: "Microphone", requirement: "Required", description: "Records dictation audio so the local engine can transcribe it on this computer.", icon: <Mic2 size={15} /> },
  { key: "accessibility", label: "Accessibility", requirement: "Recommended", description: "Allows Dictivo to control paste behavior and keep global dictation shortcuts reliable.", icon: <Keyboard size={15} /> },
  { key: "pasteAutomation", label: "Auto paste", requirement: "Optional", description: "Places the final transcript into the active app. If unavailable, the transcript stays available in Dictivo.", icon: <ClipboardCheck size={15} /> }
];

export function describePermissionStatus(value?: string): { label: string; detail: string; tone: "ready" | "attention" | "neutral" } {
  switch (value) {
    case "granted": return { label: "Ready", detail: "The operating system reports this permission as available.", tone: "ready" };
    case "clipboard-only": return { label: "Copy only", detail: "Dictivo can copy locally, but direct paste automation is not available here.", tone: "neutral" };
    case "web-preview": return { label: "Preview only", detail: "This status is from the browser preview, not the installed desktop app.", tone: "neutral" };
    case "denied":
    case "blocked": return { label: "Needs permission", detail: "Enable this permission in system settings before using the related workflow.", tone: "attention" };
    case "pending-native-prompt":
    case "not-determined":
    case undefined: return { label: "Needs system check", detail: "Dictivo has not received a confirmed system permission state yet.", tone: "attention" };
    default: return { label: "Not verified", detail: "Refresh local status after granting permissions in system settings.", tone: "neutral" };
  }
}

export function SettingsView({
  hotkeys,
  localProcessing,
  permissions,
  privateFastStatus,
  privateFastModels,
  privateFastOperation,
  runnableTiers,
  companionEnabled,
  companionAvatar,
  hardwareProfile,
  onHotkeyChange,
  onProcessingChange,
  onCompanionEnabledChange,
  onCompanionAvatarChange,
  onModelAction,
  onImportModel,
  onRefreshNative,
  initialSection = "engine"
}: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);

  return (
    <section className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? "is-selected" : ""}
            onClick={() => setSection(item.id)}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </nav>

      <div className="settings-content">
        {section === "engine" && (
          <div className="side-panel">
            <div className="panel-title"><WifiOff size={16} /><h2>Local Engine</h2></div>
            <ModelManager
              status={privateFastStatus}
              models={privateFastModels}
              hardwareProfile={hardwareProfile}
              runnableTiers={runnableTiers}
              operation={privateFastOperation}
              onModelAction={onModelAction}
              onImportModel={onImportModel}
              onRefresh={onRefreshNative}
            />
            <details className="advanced">
              <summary>Processing toggles</summary>
              <div className="toggle-list" style={{ marginTop: 8 }}>
                <ToggleRow label="Auto polish" checked={localProcessing.autoPolish} onChange={(v) => onProcessingChange("autoPolish", v)} />
                <ToggleRow label="Spoken punctuation" checked={localProcessing.spokenPunctuation} onChange={(v) => onProcessingChange("spokenPunctuation", v)} />
                <ToggleRow label="Remove fillers" checked={localProcessing.fillerWords} onChange={(v) => onProcessingChange("fillerWords", v)} />
                <ToggleRow label="Smart capitalization" checked={localProcessing.smartCapitalization} onChange={(v) => onProcessingChange("smartCapitalization", v)} />
              </div>
            </details>
          </div>
        )}

        {section === "hotkeys" && (
          <div className="side-panel">
            <div className="panel-title"><KeyRound size={16} /><h2>Hotkeys</h2></div>
            <div className="hotkey-grid">
              <ShortcutRecorder label="Dictation" value={hotkeys.dictation} onChange={(value) => onHotkeyChange("dictation", value)} />
              <ShortcutRecorder label="Paste Last" value={hotkeys.pasteLast} onChange={(value) => onHotkeyChange("pasteLast", value)} />
            </div>
            <div className="toggle-list">
              <label className="toggle-row">
                Dictation activation
                <select value={hotkeys.activationMode} onChange={(event) => onHotkeyChange("activationMode", event.target.value as HotkeySettings["activationMode"])}>
                  <option value="toggle">Toggle</option>
                  <option value="hold">Press and hold</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {section === "companion" && (
          <div className="side-panel">
            <div className="panel-title"><Bot size={16} /><h2>Floating Companion</h2></div>
            <div className="toggle-list">
              <ToggleRow label="Show floating companion" checked={companionEnabled} onChange={onCompanionEnabledChange} />
            </div>
            <div className="avatar-picker" aria-label="Companion avatar">
              {avatars.map((avatar) => (
                <button
                  key={avatar.id}
                  type="button"
                  className={companionAvatar === avatar.id ? "is-selected" : ""}
                  onClick={() => onCompanionAvatarChange(avatar.id)}
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
            <div className="panel-title"><Lock size={16} /><h2>Permissions & Privacy</h2></div>
            <div className="privacy-pledge" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><ShieldCheck size={16} />
              <div>
                <strong>Local-only by design</strong>
                <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Audio, text, dictionary terms, snippets, and transcripts stay on this device.</p>
              </div>
            </div>
            <div className="permission-list">
              {privacyPermissionItems.map((item) => {
                const status = describePermissionStatus(permissions[item.key]);
                return (
                  <article key={item.key} style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                    <span aria-hidden="true">{item.icon}</span>
                    <div>
                      <strong style={{ fontSize: 12 }}>{item.label}</strong>
                      <p style={{ margin: 0, fontSize: 11, color: "var(--muted)" }}>{item.description}</p>
                    </div>
                    <span style={{ fontSize: 11, color: status.tone === "ready" ? "var(--success)" : status.tone === "attention" ? "var(--warning)" : "var(--faint)" }}>
                      {status.label}
                    </span>
                  </article>
                );
              })}
            </div>
            <button type="button" className="text-button" onClick={onRefreshNative}>
              <RefreshCw size={13} /> Refresh local status
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
      if (event.key === "Escape") { setRecording(false); return; }
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
      <button type="button" className={`text-button ${recording ? "is-recording-shortcut" : ""}`} onClick={() => setRecording(true)}>
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
  const modifiers: string[] = [];
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
