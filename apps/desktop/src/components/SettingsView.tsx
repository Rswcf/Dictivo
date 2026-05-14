import { ArrowUp, Bot, ClipboardCheck, Cat, Dog, ImagePlus, Keyboard, KeyRound, Lock, Mic2, Receipt, RefreshCw, ShieldCheck, Sparkles, Trash2, UserRound, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import {
  activateLicense,
  checkForUpdate,
  deactivateLicense,
  getLicense,
  installUpdate,
  refreshLicense,
  type LicenseSummary,
  type UpdateCheckResult
} from "../lib/desktopBridge";
import trumpAvatarImage from "../assets/avatars/trump-companion.png";
import bikiniAvatarImage from "../assets/avatars/bikini-companion.png";
import muscleAvatarImage from "../assets/avatars/muscle-companion.png";
import type { HardwareProfile, PermissionSettingsTarget, PrivateFastModel, PrivateFastStatus, RunnableTiers, Tier } from "../lib/desktopBridge";
import { shortcutMatches } from "../lib/hotkeys";
import { readCustomCompanionAvatar, type CompanionAvatar, type CustomCompanionAvatar, type HotkeySettings, type LocalProcessingSettings } from "../lib/settingsStore";
import { ModelManager } from "./ModelManager";

type SettingsSection = "engine" | "hotkeys" | "companion" | "license" | "privacy";

type SettingsViewProps = {
  appVersion: string;
  hotkeys: HotkeySettings;
  localProcessing: LocalProcessingSettings;
  permissions: Record<string, string>;
  privateFastStatus: PrivateFastStatus;
  privateFastModels: PrivateFastModel[];
  privateFastOperation: string;
  runnableTiers: RunnableTiers;
  companionEnabled: boolean;
  companionAvatar: CompanionAvatar;
  customCompanionAvatar: CustomCompanionAvatar | null;
  hardwareProfile: HardwareProfile | null;
  onHotkeyChange: (key: keyof HotkeySettings, value: string) => void;
  onProcessingChange: (key: keyof LocalProcessingSettings, value: boolean) => void;
  onCompanionEnabledChange: (enabled: boolean) => void;
  onCompanionAvatarChange: (avatar: CompanionAvatar) => void;
  onCustomCompanionAvatarChange: (avatar: CustomCompanionAvatar | null) => void;
  onModelAction: (action: "select" | "download" | "delete", modelId: string) => void;
  onImportModel: (modelId: string, sourcePath: string) => void;
  onRefreshNative: () => void;
  onOpenPermissionSettings: (target: PermissionSettingsTarget) => void;
  selectedTier: Tier;
  rerunStatus: "idle" | "measuring" | "error";
  rerunError: string;
  onTierChange: (tier: Tier) => void;
  onRerunBenchmark: () => void;
  onOpenWizard: () => void;
  initialSection?: SettingsSection;
};

const sections: Array<{ id: SettingsSection; label: string; icon: ReactNode }> = [
  { id: "engine", label: "Local Engine", icon: <WifiOff size={14} /> },
  { id: "hotkeys", label: "Hotkeys", icon: <KeyRound size={14} /> },
  { id: "companion", label: "Companion", icon: <Bot size={14} /> },
  { id: "license", label: "License & Updates", icon: <Receipt size={14} /> },
  { id: "privacy", label: "Privacy", icon: <Lock size={14} /> }
];

const avatars: Array<{ id: CompanionAvatar; label: string; icon: ReactNode; image?: string }> = [
  { id: "dog", label: "Dog", icon: <Dog size={18} /> },
  { id: "cat", label: "Cat", icon: <Cat size={18} /> },
  { id: "trump", label: "Trump", icon: <UserRound size={18} />, image: trumpAvatarImage },
  { id: "bikini", label: "Bikini", icon: <Sparkles size={18} />, image: bikiniAvatarImage },
  { id: "muscle", label: "Muscle", icon: <Sparkles size={18} />, image: muscleAvatarImage }
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
    case "not-required": return { label: "Not required", detail: "This platform does not require an extra permission for this workflow.", tone: "ready" };
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

export function canOpenPermissionSettings(value?: string) {
  return ["denied", "blocked", "pending-native-prompt", "not-determined", "not-verified", undefined].includes(value);
}

export function SettingsView({
  appVersion,
  hotkeys,
  localProcessing,
  permissions,
  privateFastStatus,
  privateFastModels,
  privateFastOperation,
  runnableTiers,
  companionEnabled,
  companionAvatar,
  customCompanionAvatar,
  hardwareProfile,
  onHotkeyChange,
  onProcessingChange,
  onCompanionEnabledChange,
  onCompanionAvatarChange,
  onCustomCompanionAvatarChange,
  onModelAction,
  onImportModel,
  onRefreshNative,
  onOpenPermissionSettings,
  selectedTier,
  rerunStatus,
  rerunError,
  onTierChange,
  onRerunBenchmark,
  onOpenWizard,
  initialSection = "engine"
}: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [avatarUploadError, setAvatarUploadError] = useState("");

  const handleCustomAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    try {
      const avatar = await readCustomCompanionAvatar(file);
      setAvatarUploadError("");
      onCustomCompanionAvatarChange(avatar);
    } catch (error) {
      setAvatarUploadError(error instanceof Error ? error.message : "Unable to use that avatar image.");
    }
  };

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
              selectedTier={selectedTier}
              rerunStatus={rerunStatus}
              rerunError={rerunError}
              onModelAction={onModelAction}
              onImportModel={onImportModel}
              onRefresh={onRefreshNative}
              onTierChange={onTierChange}
              onRerunBenchmark={onRerunBenchmark}
              onOpenWizard={onOpenWizard}
            />
            <details className="advanced">
              <summary>Processing toggles</summary>
              <div className="toggle-list toggle-list--spaced">
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
              <ShortcutRecorder
                label="Dictation"
                value={hotkeys.dictation}
                reservedShortcuts={[hotkeys.pasteLast]}
                onChange={(value) => onHotkeyChange("dictation", value)}
              />
              <ShortcutRecorder
                label="Paste Last"
                value={hotkeys.pasteLast}
                reservedShortcuts={[hotkeys.dictation]}
                onChange={(value) => onHotkeyChange("pasteLast", value)}
              />
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
              {customCompanionAvatar && (
                <button
                  type="button"
                  className={companionAvatar === "custom" ? "is-selected" : ""}
                  onClick={() => onCompanionAvatarChange("custom")}
                >
                  <span className="avatar-chip avatar-chip--custom">
                    <img src={customCompanionAvatar.dataUrl} alt="" draggable={false} />
                  </span>
                  <strong>Custom</strong>
                </button>
              )}
            </div>
            <div className="custom-avatar-row">
              <label className="text-button avatar-upload-control">
                <ImagePlus size={13} />
                Upload cartoon avatar
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  aria-label="Upload custom companion avatar"
                  onChange={(event) => void handleCustomAvatarUpload(event)}
                />
              </label>
              {customCompanionAvatar && (
                <button type="button" className="text-button" onClick={() => onCustomCompanionAvatarChange(null)}>
                  <Trash2 size={13} />
                  Remove custom
                </button>
              )}
            </div>
            {avatarUploadError && (
              <div className="settings-inline-error" role="alert">{avatarUploadError}</div>
            )}
          </div>
        )}

        {section === "license" && <LicenseAndUpdatesPanel appVersion={appVersion} />}

        {section === "privacy" && (
          <div className="side-panel">
            <div className="panel-title"><Lock size={16} /><h2>Permissions & Privacy</h2></div>
            <div className="privacy-pledge"><ShieldCheck size={16} />
              <div>
                <strong>Local-only by design</strong>
                <p>Audio, text, dictionary terms, snippets, and transcripts stay on this device.</p>
              </div>
            </div>
            <div className="version-row" aria-label="App version">
              <span>Version</span>
              <code>v{appVersion}</code>
            </div>
            <div className="permission-list">
              {privacyPermissionItems.map((item) => {
                const status = describePermissionStatus(permissions[item.key]);
                return (
                  <article key={item.key} className="permission-item">
                    <span aria-hidden="true">{item.icon}</span>
                    <div>
                      <strong className="permission-label">{item.label}</strong>
                      <p className="permission-description">{item.description}</p>
                      <p className="permission-detail">{status.detail}</p>
                    </div>
                    <div className="permission-action">
                      <span className={`permission-status permission-status--${status.tone}`}>
                        {status.label}
                      </span>
                      {canOpenPermissionSettings(permissions[item.key]) && (
                        <button type="button" className="text-button" onClick={() => onOpenPermissionSettings(item.key)}>
                          Open settings
                        </button>
                      )}
                    </div>
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

function ShortcutRecorder({
  label,
  value,
  reservedShortcuts = [],
  onChange
}: {
  label: string;
  value: string;
  reservedShortcuts?: string[];
  onChange: (value: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!recording) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") { setRecording(false); setError(""); return; }
      const shortcut = eventToShortcut(event);
      if (!shortcut) return;
      if (!hasShortcutModifier(shortcut)) {
        setError("Use Command, Control, or Alt with another key.");
        return;
      }
      if (reservedShortcuts.some((reserved) => shortcutsConflict(shortcut, reserved))) {
        setError("This shortcut is already assigned.");
        return;
      }
      onChange(shortcut);
      setRecording(false);
      setError("");
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onChange, recording, reservedShortcuts]);

  return (
    <div className="hotkey-row">
      <div>
        <strong>{label}</strong>
        <span>{value}</span>
        {error && <span className="shortcut-error" aria-live="polite">{error}</span>}
      </div>
      <button type="button" className={`text-button ${recording ? "is-recording-shortcut" : ""}`} onClick={() => { setRecording(true); setError(""); }}>
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

function hasShortcutModifier(shortcut: string) {
  return shortcut.split("+").some((part) => ["CommandOrControl", "Alt"].includes(part));
}

function shortcutsConflict(left: string, right: string) {
  if (!left.trim() || !right.trim()) return false;
  return shortcutMatches(left, right) || shortcutMatches(right, left);
}

function normalizedShortcutKey(key: string) {
  if (["Meta", "Control", "Alt", "Shift"].includes(key)) return "";
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function LicenseAndUpdatesPanel({ appVersion }: { appVersion: string }) {
  const [license, setLicense] = useState<LicenseSummary | null>(null);
  const [licenseKeyDraft, setLicenseKeyDraft] = useState("");
  const [activationBusy, setActivationBusy] = useState(false);
  const [activationError, setActivationError] = useState("");
  const [activationSuccess, setActivationSuccess] = useState("");

  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");

  useEffect(() => {
    void getLicense().then(setLicense).catch(() => undefined);
  }, []);

  const reloadLicense = useCallback(async () => {
    const fresh = await getLicense().catch(() => null);
    if (fresh) setLicense(fresh);
  }, []);

  const handleActivate = useCallback(async () => {
    setActivationError("");
    setActivationSuccess("");
    if (!licenseKeyDraft.trim()) {
      setActivationError("Enter your license key first.");
      return;
    }
    setActivationBusy(true);
    try {
      const instanceName =
        typeof navigator !== "undefined" && navigator.userAgent
          ? `Dictivo on ${navigator.platform || "this device"}`
          : "Dictivo activation";
      const fresh = await activateLicense(licenseKeyDraft.trim(), instanceName);
      setLicense(fresh);
      setLicenseKeyDraft("");
      setActivationSuccess(`Activated. Updates included until ${formatDate(fresh.updatesUntil)}.`);
    } catch (error) {
      setActivationError(error instanceof Error ? error.message : "Activation failed.");
    } finally {
      setActivationBusy(false);
    }
  }, [licenseKeyDraft]);

  const handleRefresh = useCallback(async () => {
    setActivationError("");
    setActivationSuccess("");
    setActivationBusy(true);
    try {
      const fresh = await refreshLicense();
      setLicense(fresh);
      setActivationSuccess("License refreshed.");
    } catch (error) {
      setActivationError(error instanceof Error ? error.message : "Refresh failed.");
    } finally {
      setActivationBusy(false);
    }
  }, []);

  const handleDeactivate = useCallback(async () => {
    setActivationError("");
    setActivationSuccess("");
    setActivationBusy(true);
    try {
      await deactivateLicense();
      await reloadLicense();
      setActivationSuccess("License removed from this device.");
    } catch (error) {
      setActivationError(error instanceof Error ? error.message : "Deactivation failed.");
    } finally {
      setActivationBusy(false);
    }
  }, [reloadLicense]);

  const handleCheckUpdate = useCallback(async () => {
    setUpdateMessage("");
    setUpdateBusy(true);
    try {
      const result = await checkForUpdate();
      setUpdateCheck(result);
      if (result.kind === "upToDate") setUpdateMessage("You're on the latest version.");
      else if (result.kind === "failed") setUpdateMessage("Could not reach the update server.");
      else if (result.kind === "windowExpired") setUpdateMessage("A newer version exists but your update window has ended.");
      else if (result.kind === "available" && result.info) setUpdateMessage(`Update ${result.info.version} is ready.`);
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : "Update check failed.");
    } finally {
      setUpdateBusy(false);
    }
  }, []);

  const handleInstall = useCallback(async () => {
    setUpdateMessage("Downloading update...");
    setUpdateBusy(true);
    try {
      await installUpdate();
      setUpdateMessage("Update downloaded. It will install the next time you quit Dictivo.");
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : "Install failed.");
    } finally {
      setUpdateBusy(false);
    }
  }, []);

  return (
    <div className="side-panel">
      <div className="panel-title"><Receipt size={16} /><h2>License & Updates</h2></div>

      {license?.present ? (
        <div className="license-card">
          <div className="license-row"><span>Licensed to</span><strong>{license.email || "—"}</strong></div>
          {license.productName ? (
            <div className="license-row"><span>Product</span><strong>{license.productName}</strong></div>
          ) : null}
          <div className="license-row"><span>Purchased</span><strong>{formatDate(license.createdAt)}</strong></div>
          <div className="license-row">
            <span>Updates until</span>
            <strong>
              {formatDate(license.updatesUntil)}
              {license.daysRemaining > 0 ? ` (${license.daysRemaining} days left)` : license.daysRemaining === 0 ? " (today)" : " (window ended)"}
            </strong>
          </div>
          <div className="license-row"><span>Status</span><strong>{license.status}</strong></div>
          <div className="license-actions">
            <button type="button" onClick={handleRefresh} disabled={activationBusy}>
              <RefreshCw size={13} /> Refresh
            </button>
            <button type="button" onClick={handleDeactivate} disabled={activationBusy}>
              <Trash2 size={13} /> Remove from this device
            </button>
          </div>
        </div>
      ) : (
        <div className="license-card license-card--empty">
          <p className="muted">
            Dictivo runs free with the <code>tiny</code> model. Activate a license to unlock all models and 12 months of updates.
          </p>
          <label className="license-input-row">
            <span>License key</span>
            <input
              type="text"
              value={licenseKeyDraft}
              autoComplete="off"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              onChange={(e) => setLicenseKeyDraft(e.target.value)}
              disabled={activationBusy}
            />
          </label>
          <button
            type="button"
            className="primary"
            onClick={handleActivate}
            disabled={activationBusy || !licenseKeyDraft.trim()}
          >
            Activate
          </button>
        </div>
      )}

      {activationError && <div className="settings-inline-error" role="alert">{activationError}</div>}
      {activationSuccess && <div className="settings-inline-success" role="status">{activationSuccess}</div>}

      <hr className="settings-divider" />

      <div className="updates-block">
        <div className="updates-row">
          <span>Current version</span>
          <code>v{appVersion}</code>
        </div>
        <div className="updates-actions">
          <button type="button" onClick={handleCheckUpdate} disabled={updateBusy}>
            <RefreshCw size={13} /> Check for updates
          </button>
          {updateCheck?.kind === "available" && updateCheck.info ? (
            <button type="button" className="primary" onClick={handleInstall} disabled={updateBusy}>
              <ArrowUp size={13} /> Install {updateCheck.info.version}
            </button>
          ) : null}
        </div>
        {updateMessage ? <p className="muted updates-status">{updateMessage}</p> : null}
        <p className="muted updates-footnote">
          Dictivo checks once at launch and every 24 hours. The request carries only a version number and your license token — no identifiers, no telemetry.
        </p>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
