import { ArrowUp, Bot, ClipboardCheck, Cat, Dog, ExternalLink, ImagePlus, Keyboard, KeyRound, Lock, Mic2, RefreshCw, ShieldCheck, Sparkles, Trash2, UserRound, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import {
  activateCloudFastLicense,
  activateLicense,
  checkForUpdate,
  deactivateCloudFastLicense,
  deactivateLicense,
  getCloudFastLicense,
  getLicense,
  installUpdate,
  migrateCloudFastLicenseFromLocal,
  refreshCloudFastLicense,
  refreshLicense,
  type LicenseSummary,
  type UpdateCheckResult
} from "../lib/desktopBridge";
import irisAvatarImage from "../assets/avatars/iris-companion.png";
import marcusAvatarImage from "../assets/avatars/marcus-companion.png";
import type { HardwareProfile, PermissionSettingsTarget, PrivateFastModel, PrivateFastStatus, RunnableTiers, Tier } from "../lib/desktopBridge";
import { shortcutMatches } from "../lib/hotkeys";
import { clearCloudFastSessionCache, type CloudFastEntitlement } from "../lib/cloudFastEngine";
import { readCustomCompanionAvatar, type CompanionAvatar, type CompanionDisplayMode, type CustomCompanionAvatar, type HotkeySettings, type LocalProcessingSettings, type TranscriptionMode } from "../lib/settingsStore";
import { playStartSound, START_SOUND_VARIANTS, type StartSoundId } from "../lib/sounds";
import { ModelManager } from "./ModelManager";

type SettingsSection = "engine" | "hotkeys" | "companion" | "license" | "privacy";

type SettingsViewProps = {
  appVersion: string;
  transcriptionMode: TranscriptionMode;
  cloudFastEntitlement: CloudFastEntitlement;
  hotkeys: HotkeySettings;
  localProcessing: LocalProcessingSettings;
  permissions: Record<string, string>;
  privateFastStatus: PrivateFastStatus;
  privateFastModels: PrivateFastModel[];
  privateFastOperation: string;
  runnableTiers: RunnableTiers;
  companionEnabled: boolean;
  companionDisplayMode: CompanionDisplayMode;
  companionAvatar: CompanionAvatar;
  customCompanionAvatar: CustomCompanionAvatar | null;
  hardwareProfile: HardwareProfile | null;
  onHotkeyChange: (key: keyof HotkeySettings, value: string) => void;
  onTranscriptionModeChange: (mode: TranscriptionMode) => void;
  onUpgradeCloudFast: () => void;
  onManageCloudFastBilling?: () => void;
  onProcessingChange: (key: keyof LocalProcessingSettings, value: boolean) => void;
  onCompanionEnabledChange: (enabled: boolean) => void;
  onCompanionDisplayModeChange: (mode: CompanionDisplayMode) => void;
  onCompanionAvatarChange: (avatar: CompanionAvatar) => void;
  onCustomCompanionAvatarChange: (avatar: CustomCompanionAvatar | null) => void;
  startSound: StartSoundId;
  onStartSoundChange: (sound: StartSoundId) => void;
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
  /** License key handed in via a `dictivo://activate?key=...` deep link. */
  pendingLicenseKey?: string;
  /** Cloud Fast key handed in via `dictivo://activate-cloud-fast?key=...`. */
  pendingCloudFastLicenseKey?: string;
  onLicenseKeyConsumed?: () => void;
  onCloudFastLicenseKeyConsumed?: () => void;
  onCloudFastLicenseChange?: () => Promise<CloudFastEntitlement | void> | CloudFastEntitlement | void;
};

const sections: Array<{ id: SettingsSection; label: string; icon: ReactNode }> = [
  { id: "engine", label: "Engine", icon: <Mic2 size={14} /> },
  { id: "hotkeys", label: "Hotkeys", icon: <KeyRound size={14} /> },
  { id: "companion", label: "Companion", icon: <Bot size={14} /> },
  { id: "license", label: "Account & Billing", icon: <UserRound size={14} /> },
  { id: "privacy", label: "Privacy", icon: <Lock size={14} /> }
];

const avatars: Array<{ id: CompanionAvatar; label: string; icon: ReactNode; image?: string }> = [
  { id: "dog", label: "Dog", icon: <Dog size={18} /> },
  { id: "cat", label: "Cat", icon: <Cat size={18} /> },
  { id: "iris", label: "Iris", icon: <Sparkles size={18} />, image: irisAvatarImage },
  { id: "marcus", label: "Marcus", icon: <Sparkles size={18} />, image: marcusAvatarImage }
];

export const privacyPermissionItems: Array<{
  key: "microphone" | "accessibility" | "pasteAutomation";
  label: string;
  requirement: string;
  description: string;
  icon: ReactNode;
}> = [
  { key: "microphone", label: "Microphone", requirement: "Required", description: "Records dictation audio when you start Local or Cloud Fast dictation.", icon: <Mic2 size={15} /> },
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
  transcriptionMode,
  cloudFastEntitlement,
  hotkeys,
  localProcessing,
  permissions,
  privateFastStatus,
  privateFastModels,
  privateFastOperation,
  runnableTiers,
  companionEnabled,
  companionDisplayMode,
  companionAvatar,
  customCompanionAvatar,
  hardwareProfile,
  onHotkeyChange,
  onTranscriptionModeChange,
  onUpgradeCloudFast,
  onManageCloudFastBilling,
  onProcessingChange,
  onCompanionEnabledChange,
  onCompanionDisplayModeChange,
  onCompanionAvatarChange,
  onCustomCompanionAvatarChange,
  startSound,
  onStartSoundChange,
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
  initialSection = "engine",
  pendingLicenseKey,
  pendingCloudFastLicenseKey,
  onLicenseKeyConsumed,
  onCloudFastLicenseKeyConsumed,
  onCloudFastLicenseChange
}: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [avatarUploadError, setAvatarUploadError] = useState("");
  const isCloudFastMode = transcriptionMode === "cloud-fast";

  // When a deep link arrives after Settings is already mounted (or the user
  // navigates here mid-flow), follow the requested section.
  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);

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
            <div className="panel-title"><Mic2 size={16} /><h2>Engine</h2></div>
            <div className="engine-mode-settings" role="radiogroup" aria-label="Default transcription mode">
              <button
                type="button"
                role="radio"
                aria-checked={transcriptionMode === "local"}
                className={transcriptionMode === "local" ? "is-selected" : ""}
                onClick={() => onTranscriptionModeChange("local")}
              >
                <strong>Local</strong>
                <span>Local keeps audio on this device.</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={transcriptionMode === "cloud-fast"}
                className={transcriptionMode === "cloud-fast" ? "is-selected" : ""}
                onClick={() => onTranscriptionModeChange("cloud-fast")}
              >
                <strong>Cloud Fast</strong>
                <span>Cloud Fast uploads audio to cloud transcription providers for faster results.</span>
              </button>
            </div>
            <div className="language-output-panel" aria-label="Language behavior">
              <div>
                <strong>Language</strong>
                <span>Input is auto-detected. Output stays in the spoken language.</span>
              </div>
              <span className="mode-status-badge mode-status-badge--ready">Auto</span>
            </div>
            {isCloudFastMode ? (
              <CloudFastSettingsPanel
                entitlement={cloudFastEntitlement}
                onUpgradeCloudFast={onUpgradeCloudFast}
                onOpenAccount={() => setSection("license")}
              />
            ) : (
              <div className="local-engine-settings">
                <div className="mode-section-heading">
                  <div>
                    <strong>Local model setup</strong>
                    <span>Model choice and hardware calibration for private on-device dictation.</span>
                  </div>
                  <span className="mode-status-badge mode-status-badge--private">
                    <WifiOff size={12} /> Private
                  </span>
                </div>
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
              </div>
            )}
            <details className="advanced text-cleanup-settings">
              <summary>Text cleanup</summary>
              <p className="advanced-description">Applies after transcription in either Local or Cloud Fast mode.</p>
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
            <div className="companion-mode-picker" role="radiogroup" aria-label="Companion display mode">
              <button
                type="button"
                role="radio"
                aria-checked={companionDisplayMode === "card"}
                className={companionDisplayMode === "card" ? "is-selected" : ""}
                onClick={() => onCompanionDisplayModeChange("card")}
              >
                <strong>Status card</strong>
                <span>Quiet dictation panel</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={companionDisplayMode === "pet"}
                className={companionDisplayMode === "pet" ? "is-selected" : ""}
                onClick={() => onCompanionDisplayModeChange("pet")}
              >
                <strong>Animated pet</strong>
                <span>Cartoon companion</span>
              </button>
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

            <div className="start-sound-block">
              <div className="start-sound-heading">
                <strong>Start sound</strong>
                <span>Plays when you press the hotkey to confirm the mic is open.</span>
              </div>
              <div className="start-sound-list" role="radiogroup" aria-label="Start sound">
                {START_SOUND_VARIANTS.map((variant) => (
                  <label key={variant.id} className={`start-sound-row ${startSound === variant.id ? "is-selected" : ""}`}>
                    <input
                      type="radio"
                      name="start-sound"
                      value={variant.id}
                      checked={startSound === variant.id}
                      onChange={() => onStartSoundChange(variant.id)}
                    />
                    <div className="start-sound-meta">
                      <strong>{variant.label}</strong>
                      <span>{variant.description}</span>
                    </div>
                    <button
                      type="button"
                      className="start-sound-preview"
                      onClick={(event) => {
                        event.preventDefault();
                        playStartSound(variant.id);
                      }}
                    >
                      Preview
                    </button>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === "license" && (
          <LicenseAndUpdatesPanel
            appVersion={appVersion}
            cloudFastEntitlement={cloudFastEntitlement}
            onUpgradeCloudFast={onUpgradeCloudFast}
            onManageCloudFastBilling={onManageCloudFastBilling}
            pendingLicenseKey={pendingLicenseKey}
            pendingCloudFastLicenseKey={pendingCloudFastLicenseKey}
            onLicenseKeyConsumed={onLicenseKeyConsumed}
            onCloudFastLicenseKeyConsumed={onCloudFastLicenseKeyConsumed}
            onCloudFastLicenseChange={onCloudFastLicenseChange}
          />
        )}

        {section === "privacy" && (
          <div className="side-panel">
            <div className="panel-title"><Lock size={16} /><h2>Permissions & Privacy</h2></div>
            <div className="privacy-pledge"><ShieldCheck size={16} />
              <div>
                <strong>Local by default</strong>
                <p>Local keeps audio on this device. Cloud Fast uploads audio to cloud transcription providers for faster results.</p>
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

function CloudFastSettingsPanel({
  entitlement,
  onUpgradeCloudFast,
  onOpenAccount
}: {
  entitlement: CloudFastEntitlement;
  onUpgradeCloudFast: () => void;
  onOpenAccount: () => void;
}) {
  const limitMinutes = formatMinutes(entitlement.monthlySecondsLimit);
  const usedMinutes = formatMinutes(entitlement.monthlySecondsUsed);
  const usagePercent = entitlement.monthlySecondsLimit > 0
    ? Math.min(100, Math.round((entitlement.monthlySecondsUsed / entitlement.monthlySecondsLimit) * 100))
    : 0;
  const renewsLabel = entitlement.renewsAt ? formatDate(entitlement.renewsAt) : "Monthly";

  return (
    <section className={`cloud-fast-mode-panel ${entitlement.available ? "is-ready" : "is-locked"}`} aria-label="Cloud Fast settings">
      <div className="mode-section-heading">
        <div>
          <strong>{entitlement.available ? "Cloud Fast ready" : "Cloud Fast subscription required"}</strong>
          <span>Fast cloud transcription with automatic fallback.</span>
        </div>
        <span className={`mode-status-badge ${entitlement.available ? "mode-status-badge--ready" : "mode-status-badge--locked"}`}>
          {entitlement.available ? "Ready" : "Locked"}
        </span>
      </div>

      <div className="cloud-fast-usage-block">
        <div className="cloud-fast-usage-header">
          <span>Monthly usage</span>
          <strong>{usedMinutes} / {limitMinutes} minutes</strong>
        </div>
        <div className="cloud-fast-meter" aria-hidden="true">
          <span style={{ width: `${usagePercent}%` }} />
        </div>
        <div className="cloud-fast-usage-meta">
          <span>{entitlement.plan === "unknown" ? "Plan pending" : entitlement.plan}</span>
          <span>{renewsLabel}</span>
        </div>
      </div>

      <p className="cloud-fast-privacy-note">
        <ShieldCheck size={14} />
        {entitlement.privacyNotice || "Cloud Fast uploads audio to cloud transcription providers for faster results."}
      </p>

      <div className="cloud-fast-actions">
        {entitlement.available ? (
          <button type="button" className="text-button" onClick={onOpenAccount}>
            Account & Billing
          </button>
        ) : (
          <>
            <button type="button" className="text-button primary" onClick={onUpgradeCloudFast}>
              <ArrowUp size={13} /> Upgrade to Cloud Fast
            </button>
            <button type="button" className="text-button" onClick={onOpenAccount}>
              Enter license key
            </button>
          </>
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

type LicenseAndUpdatesPanelProps = {
  appVersion: string;
  cloudFastEntitlement: CloudFastEntitlement;
  onUpgradeCloudFast: () => void;
  onManageCloudFastBilling?: () => void;
  pendingLicenseKey?: string;
  pendingCloudFastLicenseKey?: string;
  onLicenseKeyConsumed?: () => void;
  onCloudFastLicenseKeyConsumed?: () => void;
  onCloudFastLicenseChange?: () => Promise<CloudFastEntitlement | void> | CloudFastEntitlement | void;
};

function LicenseAndUpdatesPanel({
  appVersion,
  cloudFastEntitlement,
  onUpgradeCloudFast,
  onManageCloudFastBilling,
  pendingLicenseKey,
  pendingCloudFastLicenseKey,
  onLicenseKeyConsumed,
  onCloudFastLicenseKeyConsumed,
  onCloudFastLicenseChange
}: LicenseAndUpdatesPanelProps) {
  const [license, setLicense] = useState<LicenseSummary | null>(null);
  const [cloudFastLicense, setCloudFastLicense] = useState<LicenseSummary | null>(null);
  const [licenseKeyDraft, setLicenseKeyDraft] = useState("");
  const [cloudFastKeyDraft, setCloudFastKeyDraft] = useState("");
  const [activationBusy, setActivationBusy] = useState(false);
  const [cloudFastBusy, setCloudFastBusy] = useState(false);
  const [activationError, setActivationError] = useState("");
  const [activationSuccess, setActivationSuccess] = useState("");
  const [cloudFastError, setCloudFastError] = useState("");
  const [cloudFastSuccess, setCloudFastSuccess] = useState("");

  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");

  useEffect(() => {
    void getLicense()
      .then((fresh) => setLicense((current) => current?.present ? current : fresh))
      .catch(() => undefined);
    void getCloudFastLicense()
      .then((fresh) => setCloudFastLicense((current) => current?.present ? current : fresh))
      .catch(() => undefined);
  }, []);

  // When a deep link delivers a license key while Settings is already mounted,
  // prefill the input. We only auto-fill, not auto-submit, so the user always
  // sees what is about to be sent to the license server.
  useEffect(() => {
    if (pendingLicenseKey && pendingLicenseKey.trim().length > 0) {
      setLicenseKeyDraft(pendingLicenseKey.trim());
      setActivationError("");
      setActivationSuccess("Activation link received — review the key and click Activate.");
      onLicenseKeyConsumed?.();
    }
  }, [pendingLicenseKey, onLicenseKeyConsumed]);

  useEffect(() => {
    if (pendingCloudFastLicenseKey && pendingCloudFastLicenseKey.trim().length > 0) {
      const key = pendingCloudFastLicenseKey.trim();
      setCloudFastKeyDraft(key);
      setCloudFastError("");
      setCloudFastSuccess("Cloud Fast activation link received — activating on this device...");
      onCloudFastLicenseKeyConsumed?.();

      const instanceName =
        typeof navigator !== "undefined" && navigator.userAgent
          ? `Dictivo Cloud Fast on ${navigator.platform || "this device"}`
          : "Dictivo Cloud Fast activation";

      setCloudFastBusy(true);
      void activateCloudFastLicense(key, instanceName)
        .then(async (fresh) => {
          clearCloudFastSessionCache();
          setCloudFastLicense(fresh);
          setCloudFastKeyDraft("");
          const entitlement = await onCloudFastLicenseChange?.();
          if (entitlement && !entitlement.available) {
            setCloudFastSuccess("");
            setCloudFastError("License saved, but Cloud Fast access was not confirmed. Refresh or try again in a moment.");
            return;
          }
          setCloudFastSuccess("Cloud Fast activated. Account & Billing is ready.");
        })
        .catch((error: unknown) => {
          setCloudFastSuccess("");
          setCloudFastError(error instanceof Error ? error.message : "Cloud Fast activation failed.");
        })
        .finally(() => setCloudFastBusy(false));
    }
  }, [pendingCloudFastLicenseKey, onCloudFastLicenseChange, onCloudFastLicenseKeyConsumed]);

  const reloadLicense = useCallback(async () => {
    const fresh = await getLicense().catch(() => null);
    if (fresh) setLicense(fresh);
  }, []);

  const reloadCloudFastLicense = useCallback(async () => {
    const fresh = await getCloudFastLicense().catch(() => null);
    if (fresh) setCloudFastLicense(fresh);
  }, []);

  const localLicenseIsCloudFast = isCloudFastLicenseSummary(license);
  const accountEmail = cloudFastLicense?.email || license?.email || "";
  const accountHasCloudFast = Boolean(cloudFastLicense?.present || cloudFastEntitlement.available);
  const accountPlan = accountHasCloudFast ? "Cloud Fast" : license?.present ? "Local license" : "Local only";
  const accountStatus = accountHasCloudFast
    ? cloudFastEntitlement.available ? "active" : cloudFastLicense?.status || "pending"
    : license?.present ? license.status : "not signed in";
  const canManageCloudFastBilling = Boolean(accountHasCloudFast && onManageCloudFastBilling);

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
      if (isCloudFastLicenseSummary(fresh)) {
        setLicense(fresh);
        setLicenseKeyDraft("");
        setActivationError("This is a Cloud Fast license. Move it to the Cloud Fast license section below before using Cloud Fast.");
        return;
      }
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

  const handleMoveCloudFastFromLocal = useCallback(async () => {
    setActivationError("");
    setActivationSuccess("");
    setCloudFastError("");
    setCloudFastSuccess("");
    setActivationBusy(true);
    setCloudFastBusy(true);
    try {
      const fresh = await migrateCloudFastLicenseFromLocal();
      clearCloudFastSessionCache();
      setCloudFastLicense(fresh);
      await reloadLicense();
      const entitlement = await onCloudFastLicenseChange?.();
      if (entitlement && !entitlement.available) {
        setCloudFastError("Cloud Fast license moved, but Cloud Fast access was not confirmed. Refresh or try again in a moment.");
        return;
      }
      setCloudFastSuccess("Cloud Fast license moved and activated.");
    } catch (error) {
      setCloudFastError(error instanceof Error ? error.message : "Cloud Fast license migration failed.");
    } finally {
      setActivationBusy(false);
      setCloudFastBusy(false);
    }
  }, [onCloudFastLicenseChange, reloadLicense]);

  const handleCloudFastActivate = useCallback(async () => {
    setCloudFastError("");
    setCloudFastSuccess("");
    if (!cloudFastKeyDraft.trim()) {
      setCloudFastError("Enter your Cloud Fast license key first.");
      return;
    }
    setCloudFastBusy(true);
    try {
      const instanceName =
        typeof navigator !== "undefined" && navigator.userAgent
          ? `Dictivo Cloud Fast on ${navigator.platform || "this device"}`
          : "Dictivo Cloud Fast activation";
      const fresh = await activateCloudFastLicense(cloudFastKeyDraft.trim(), instanceName);
      clearCloudFastSessionCache();
      setCloudFastLicense(fresh);
      setCloudFastKeyDraft("");
      const entitlement = await onCloudFastLicenseChange?.();
      if (entitlement && !entitlement.available) {
        setCloudFastError("License saved, but Cloud Fast access was not confirmed. Confirm this key belongs to Dictivo Cloud Fast, then refresh.");
        setCloudFastSuccess("");
        return;
      }
      setCloudFastSuccess("Cloud Fast license activated.");
    } catch (error) {
      setCloudFastError(error instanceof Error ? error.message : "Cloud Fast activation failed.");
    } finally {
      setCloudFastBusy(false);
    }
  }, [cloudFastKeyDraft, onCloudFastLicenseChange]);

  const handleCloudFastRefresh = useCallback(async () => {
    setCloudFastError("");
    setCloudFastSuccess("");
    setCloudFastBusy(true);
    try {
      const fresh = await refreshCloudFastLicense();
      clearCloudFastSessionCache();
      setCloudFastLicense(fresh);
      setCloudFastSuccess("Cloud Fast license refreshed.");
      onCloudFastLicenseChange?.();
    } catch (error) {
      setCloudFastError(error instanceof Error ? error.message : "Cloud Fast refresh failed.");
    } finally {
      setCloudFastBusy(false);
    }
  }, []);

  const handleCloudFastDeactivate = useCallback(async () => {
    setCloudFastError("");
    setCloudFastSuccess("");
    setCloudFastBusy(true);
    try {
      await deactivateCloudFastLicense();
      clearCloudFastSessionCache();
      await reloadCloudFastLicense();
      setCloudFastSuccess("Cloud Fast license removed from this device.");
      onCloudFastLicenseChange?.();
    } catch (error) {
      setCloudFastError(error instanceof Error ? error.message : "Cloud Fast deactivation failed.");
    } finally {
      setCloudFastBusy(false);
    }
  }, [reloadCloudFastLicense]);

  const handleManageBilling = useCallback(() => {
    if (onManageCloudFastBilling) {
      onManageCloudFastBilling();
      return;
    }
    onUpgradeCloudFast();
  }, [onManageCloudFastBilling, onUpgradeCloudFast]);

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
      <div className="panel-title"><UserRound size={16} /><h2>Account & Billing</h2></div>

      <section className="account-summary-card" aria-label="Account status">
        <div className="account-avatar" aria-hidden="true">
          {accountEmail ? accountEmail.slice(0, 1).toUpperCase() : "D"}
        </div>
        <div className="account-summary-main">
          <span>{accountEmail ? "Signed in for billing" : "No cloud account connected"}</span>
          <strong>{accountEmail || "Local-first mode"}</strong>
          <p>
            {accountHasCloudFast
              ? "Cloud Fast is tied to this device through your subscription license. Local dictation remains available separately."
              : "Dictivo can run locally without an account. Connect Cloud Fast only when you want fast cloud transcription."}
          </p>
        </div>
        <div className="account-summary-side">
          <span className={`account-plan-badge ${accountHasCloudFast ? "is-cloud" : "is-local"}`}>{accountPlan}</span>
          <span className="account-status-text">{accountStatus}</span>
        </div>
      </section>

      <div className="account-action-row">
        {accountHasCloudFast ? (
          <button type="button" onClick={handleManageBilling} disabled={!canManageCloudFastBilling}>
            <ExternalLink size={13} /> Manage subscription
          </button>
        ) : (
          <button type="button" className="primary" onClick={onUpgradeCloudFast}>
            <ArrowUp size={13} /> Upgrade to Cloud Fast
          </button>
        )}
        <button type="button" onClick={handleCloudFastRefresh} disabled={cloudFastBusy || !cloudFastLicense?.present}>
          <RefreshCw size={13} /> Refresh Cloud Fast
        </button>
      </div>

      <p className="account-privacy-note">
        <ShieldCheck size={14} />
        Local keeps audio on this device. Cloud Fast uploads audio only when Cloud Fast mode is selected.
      </p>

      <hr className="settings-divider" />

      <div className="license-section-heading">
        <strong>Private Local license</strong>
        <span>Optional. Unlocks local models and the 12-month update window without requiring a cloud account.</span>
      </div>

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
          {localLicenseIsCloudFast ? (
            <div className="license-repair-callout">
              <p>
                This Cloud Fast subscription is saved in the Local license slot, so Cloud Fast is still locked.
              </p>
              <button type="button" className="primary" onClick={handleMoveCloudFastFromLocal} disabled={activationBusy || cloudFastBusy}>
                Move to Cloud Fast license
              </button>
            </div>
          ) : null}
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

      <div className="license-section-heading">
        <strong>Cloud Fast subscription</strong>
        <span>Primary path is checkout and automatic activation. Manual key entry stays here as a fallback.</span>
      </div>

      {cloudFastLicense?.present ? (
        <div className="license-card">
          <div className="license-row"><span>Licensed to</span><strong>{cloudFastLicense.email || "—"}</strong></div>
          {cloudFastLicense.productName ? (
            <div className="license-row"><span>Product</span><strong>{cloudFastLicense.productName}</strong></div>
          ) : null}
          <div className="license-row"><span>Started</span><strong>{formatDate(cloudFastLicense.createdAt)}</strong></div>
          <div className="license-row"><span>Status</span><strong>{cloudFastLicense.status}</strong></div>
          <div className="license-row">
            <span>Monthly quota</span>
            <strong>{Math.round(cloudFastEntitlement.monthlySecondsLimit / 60).toLocaleString()} minutes</strong>
          </div>
          <div className="license-actions">
            {onManageCloudFastBilling ? (
              <button type="button" onClick={onManageCloudFastBilling} disabled={cloudFastBusy}>
                <ExternalLink size={13} /> Manage subscription
              </button>
            ) : null}
            <button type="button" onClick={handleCloudFastRefresh} disabled={cloudFastBusy}>
              <RefreshCw size={13} /> Refresh
            </button>
            <button type="button" onClick={handleCloudFastDeactivate} disabled={cloudFastBusy}>
              <Trash2 size={13} /> Sign out on this device
            </button>
          </div>
        </div>
      ) : (
        <div className="license-card license-card--empty">
          <p className="muted">
            Cloud Fast is optional at ${cloudFastEntitlement.priceUsdMonthly}/month and uploads audio only when you choose Cloud Fast mode.
          </p>
          <div className="license-actions license-actions--stacked">
            <button type="button" onClick={onUpgradeCloudFast}>
              <ArrowUp size={13} /> Upgrade to Cloud Fast
            </button>
          </div>
          <label className="license-input-row">
            <span>Cloud Fast license key</span>
            <input
              type="text"
              value={cloudFastKeyDraft}
              autoComplete="off"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              onChange={(e) => setCloudFastKeyDraft(e.target.value)}
              disabled={cloudFastBusy}
            />
          </label>
          <button
            type="button"
            className="primary"
            onClick={handleCloudFastActivate}
            disabled={cloudFastBusy || !cloudFastKeyDraft.trim()}
          >
            Activate Cloud Fast
          </button>
        </div>
      )}

      {cloudFastError && <div className="settings-inline-error" role="alert">{cloudFastError}</div>}
      {cloudFastSuccess && <div className="settings-inline-success" role="status">{cloudFastSuccess}</div>}

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

function formatMinutes(seconds: number) {
  return Math.round(seconds / 60).toLocaleString();
}

function isCloudFastLicenseSummary(license: LicenseSummary | null | undefined) {
  if (!license?.present) return false;
  return license.productName.replace(/[^a-z0-9]/gi, "").toLowerCase().includes("cloudfast");
}
