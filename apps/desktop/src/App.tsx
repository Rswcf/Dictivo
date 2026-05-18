import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { PhysicalPosition, Window as TauriWindow, availableMonitors, primaryMonitor } from "@tauri-apps/api/window";
import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { BookOpenText, History, Settings, TerminalSquare } from "lucide-react";
import irisAvatarImage from "./assets/avatars/iris-companion.png";
import marcusAvatarImage from "./assets/avatars/marcus-companion.png";
import {
  resolveTranscriptLanguage,
  type DictionaryTerm,
  type InputMode,
  type LocalSession,
  type Snippet,
  type SupportedLanguage,
  type TranscriptionLanguage
} from "@dictivo/shared";
import { createId } from "./lib/id";
import { startAudioRecording, type RecordingController } from "./lib/mediaCapture";
import { playRecordingStopSound, playStartSound } from "./lib/sounds";
import { runLocalDictation } from "./lib/localDictationEngine";
import { getCloudFastEntitlement, runCloudFastDictation, type CloudFastEntitlement } from "./lib/cloudFastEngine";
import {
  benchmarkTier,
  clearLocalSessions,
  copyText,
  deleteLocalSession,
  finalizeCalibration,
  getClipboardMarker,
  getHardwareProfile,
  getPrivateFastModels,
  getPrivateFastStatus,
  getRunnableTiers,
  importPrivateFastModel,
  isTauriRuntime,
  listLocalSessions,
  openExternalUrl,
  openPermissionSettings,
  pasteText,
  requestNativePermissions,
  rerunBenchmark,
  saveLocalSession,
  selectPrivateFastModel,
  deletePrivateFastModel,
  downloadPrivateFastModel,
  writeRunnableTiers,
  type HardwareProfile,
  type PermissionSettingsTarget,
  type PrivateFastModel,
  type PrivateFastStatus,
  type RunnableTiers,
  type Tier
} from "./lib/desktopBridge";
import {
  loadSettings,
  normalizeHotkeys,
  normalizeLocalProcessing,
  saveSettings,
  type HotkeySettings,
  type LocalProcessingSettings,
  type CompanionAvatar,
  type CompanionDisplayMode,
  type TranscriptionMode,
  type CustomCompanionAvatar
} from "./lib/settingsStore";
import { buildCompanionSnapshot, type CompanionPhase } from "./lib/companion";
import { companionWindowPosition, windowIntersectsWorkArea, type WorkArea } from "./lib/companionWindowPosition";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { DictationWorkbench } from "./components/DictationWorkbench";
import { CompanionWindow } from "./components/CompanionWindow";
import { HistoryView } from "./components/HistoryView";
import { DictionaryView } from "./components/DictionaryView";
import { SettingsView } from "./components/SettingsView";
import { UpdateBanner } from "./components/UpdateBanner";
import { createActivationRateLimiter, parseDeepLink } from "./lib/deepLink";
import { formatShortcutForDisplay, resolveHotkeyIntent, uniqueShortcuts } from "./lib/hotkeys";
import { BUNDLED_APP_VERSION, getAppVersion } from "./lib/version";

type View = "dictation" | "history" | "dictionary" | "settings";

type AppProps = {
  windowLabel?: string;
};

const DEFAULT_DICTATION_MODE: InputMode = "message";
const DEFAULT_CLOUD_FAST_ENTITLEMENT: CloudFastEntitlement = {
  available: false,
  plan: "unknown",
  priceUsdMonthly: "6.99",
  monthlySecondsLimit: 90_000,
  monthlySecondsUsed: 0,
  renewsAt: null,
  upgradeUrl: "https://dictivo.app/cloud-fast",
  billingPortalUrl: "https://app.lemonsqueezy.com/my-orders",
  privacyNotice: "Cloud Fast uploads audio to cloud transcription providers for faster results."
};

export function App({ windowLabel = "main" }: AppProps) {
  if (windowLabel === "companion") return <CompanionWindow />;

  const initialSettings = useMemo(() => loadSettings(), []);
  const [view, setView] = useState<View>("dictation");
  const [language] = useState<TranscriptionLanguage>(initialSettings.language);
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>(initialSettings.transcriptionMode);
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [liveText, setLiveText] = useState("");
  const [isDictating, setIsDictating] = useState(false);
  const [dictionary, setDictionary] = useState<DictionaryTerm[]>(initialSettings.dictionary);
  const [snippets, setSnippets] = useState<Snippet[]>(initialSettings.snippets);
  const [query, setQuery] = useState("");
  const [permissions, setPermissions] = useState<Record<string, string>>({});
  const [selectedTier, setSelectedTier] = useState<Tier>(initialSettings.selectedTier);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(Boolean(initialSettings.onboardingCompleted));
  const [runnableTiers, setRunnableTiers] = useState<RunnableTiers>(() => placeholderRunnableTiers());
  const [rerunStatus, setRerunStatus] = useState<"idle" | "measuring" | "error">("idle");
  const [rerunError, setRerunError] = useState("");
  const [companionEnabled, setCompanionEnabled] = useState(initialSettings.companionEnabled);
  const [companionDisplayMode, setCompanionDisplayMode] = useState<CompanionDisplayMode>(initialSettings.companionDisplayMode);
  const [companionAvatar, setCompanionAvatar] = useState<CompanionAvatar>(initialSettings.companionAvatar);
  const [customCompanionAvatar, setCustomCompanionAvatar] = useState<CustomCompanionAvatar | null>(initialSettings.customCompanionAvatar);
  const [companionPosition, setCompanionPosition] = useState(initialSettings.companionPosition);
  const [startSound, setStartSound] = useState(initialSettings.startSound);
  const [hotkeys, setHotkeys] = useState<HotkeySettings>(normalizeHotkeys(initialSettings.hotkeys));
  const [localProcessing, setLocalProcessing] = useState<LocalProcessingSettings>(normalizeLocalProcessing(initialSettings.localProcessing));
  const [privateFastStatus, setPrivateFastStatus] = useState<PrivateFastStatus>({
    ready: false,
    modelId: "small",
    modelName: "small",
    message: "Checking local engine...",
    setupHint: "Download or import a whisper.cpp model to start local dictation."
  });
  const [privateFastModels, setPrivateFastModels] = useState<PrivateFastModel[]>([]);
  const [hardwareProfile, setHardwareProfile] = useState<HardwareProfile | null>(null);
  const [privateFastOperation, setPrivateFastOperation] = useState("");
  const [historyOperation, setHistoryOperation] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [hotkeyStatus, setHotkeyStatus] = useState("Not registered");
  const [pasteStatus, setPasteStatus] = useState("");
  const [dictationPhase, setDictationPhase] = useState<CompanionPhase>("idle");
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | undefined>();
  const [appVersion, setAppVersion] = useState(BUNDLED_APP_VERSION);
  const [pendingLicenseKey, setPendingLicenseKey] = useState<string>("");
  const [pendingCloudFastLicenseKey, setPendingCloudFastLicenseKey] = useState<string>("");
  const [cloudFastEntitlement, setCloudFastEntitlement] = useState<CloudFastEntitlement>(DEFAULT_CLOUD_FAST_ENTITLEMENT);
  const [cloudFastEntitlementChecked, setCloudFastEntitlementChecked] = useState(false);
  const [companionDismissed, setCompanionDismissed] = useState(false);
  const activationLimiterRef = useRef(createActivationRateLimiter());

  const dictationRecordingRef = useRef<RecordingController | null>(null);
  const isDictatingRef = useRef(false);
  const recordingSetupPendingRef = useRef(false);
  const stopAfterRecordingSetupRef = useRef(false);
  const stopSoundPlayedForCurrentRecordingRef = useRef(false);
  const companionPositionedRef = useRef(false);
  const lastFinalTextRef = useRef("");
  const mountedRef = useRef(true);
  const startDictationRef = useRef<(() => Promise<void>) | null>(null);
  const stopDictationRef = useRef<(() => Promise<void>) | null>(null);
  const pasteLastTranscriptRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getAppVersion().then((version) => {
      if (!cancelled) setAppVersion(version);
    });
    return () => { cancelled = true; };
  }, []);

  const selectedModel = useMemo(
    () => privateFastModels.find((model) => model.selected) ?? privateFastModels.find((model) => model.id === privateFastStatus.modelId),
    [privateFastModels, privateFastStatus.modelId]
  );
  const dictionaryForLanguage = useMemo(
    () => language === "auto" ? dictionary : dictionary.filter((term) => term.language === language),
    [dictionary, language]
  );
  const snippetsForLanguage = useMemo(
    () => language === "auto" ? snippets : snippets.filter((snippet) => snippet.language === language),
    [snippets, language]
  );

  const refreshNativeState = useCallback(async () => {
    try {
      const [status, models, hardware, permissionState] = await Promise.all([
        getPrivateFastStatus(),
        getPrivateFastModels(),
        getHardwareProfile(),
        requestNativePermissions()
      ]);
      if (!mountedRef.current) return;
      setPrivateFastStatus(status);
      setPrivateFastModels(models);
      setHardwareProfile(hardware);
      setPermissions(permissionState as Record<string, string>);
    } catch (error) {
      if (!mountedRef.current) return;
      setStatusMessage(error instanceof Error ? error.message : "Unable to refresh local engine status.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listLocalSessions()
      .then((items) => {
        if (cancelled) return;
        setSessions(items);
        lastFinalTextRef.current = items[0]?.text ?? "";
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatusMessage(error instanceof Error ? error.message : "Unable to load local history.");
      });
    void refreshNativeState();
    return () => { cancelled = true; };
  }, [refreshNativeState]);

  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem("dictivo-settings-v2");
    } catch {
      // Non-critical legacy cleanup can fail when storage is blocked.
    }
    saveSettings({
      language,
      selectedMode: DEFAULT_DICTATION_MODE,
      transcriptionMode,
      selectedTier,
      onboardingCompleted,
      companionEnabled,
      companionDisplayMode,
      companionAvatar,
      customCompanionAvatar,
      companionPosition,
      startSound,
      hotkeys,
      localProcessing,
      dictionary,
      snippets
    });
  }, [companionAvatar, companionDisplayMode, companionEnabled, companionPosition, customCompanionAvatar, dictionary, hotkeys, language, localProcessing, onboardingCompleted, selectedTier, snippets, startSound, transcriptionMode]);

  useEffect(() => {
    let cancelled = false;
    void getRunnableTiers()
      .then((tiers) => {
        if (!cancelled) setRunnableTiers(tiers);
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatusMessage(error instanceof Error ? error.message : "Unable to load local engine tier cache.");
      });
    return () => {
      cancelled = true;
    };
  }, [onboardingCompleted]);

  const refreshCloudFastEntitlement = useCallback(async () => {
    setCloudFastEntitlementChecked(false);
    try {
      const entitlement = await getCloudFastEntitlement();
      if (!mountedRef.current) return entitlement;
      setCloudFastEntitlement(entitlement);
      setCloudFastEntitlementChecked(true);
      return entitlement;
    } catch {
      if (!mountedRef.current) return DEFAULT_CLOUD_FAST_ENTITLEMENT;
      setCloudFastEntitlement(DEFAULT_CLOUD_FAST_ENTITLEMENT);
      setCloudFastEntitlementChecked(true);
      return DEFAULT_CLOUD_FAST_ENTITLEMENT;
    }
  }, []);

  useEffect(() => {
    if (transcriptionMode !== "cloud-fast") return;
    void refreshCloudFastEntitlement();
  }, [refreshCloudFastEntitlement, transcriptionMode]);

  const handleTierChange = useCallback(
    async (next: Tier) => {
      const previous = selectedTier;
      setSelectedTier(next);
      let currentTiers = runnableTiers;
      const assignment = currentTiers[next];

      if (!assignment.downloaded) {
        setPrivateFastOperation(`download:${assignment.modelId}`);
        try {
          const downloadStatus = await downloadPrivateFastModel(assignment.modelId);
          setPrivateFastStatus(downloadStatus);
          setPrivateFastModels(await getPrivateFastModels());
          const rtf = await benchmarkTier(assignment.modelId);
          const refreshed =
            next === "medium"
              ? await finalizeCalibration(rtf, assignment.modelId)
              : markTierBenchmarked(currentTiers, next, rtf);
          if (next !== "medium") await writeRunnableTiers(refreshed);
          currentTiers = refreshed;
          setRunnableTiers(refreshed);
        } catch (error) {
          setStatusMessage(error instanceof Error ? error.message : "Failed to switch tier.");
          setSelectedTier(previous);
          return;
        } finally {
          setPrivateFastOperation("");
        }
      }

      const final = currentTiers[next];
      if (isTauriRuntime() && final.modelId && final.modelId !== selectedModel?.id) {
        try {
          const status = await selectPrivateFastModel(final.modelId);
          setPrivateFastStatus(status);
          setPrivateFastModels(await getPrivateFastModels());
        } catch (error) {
          setSelectedTier(previous);
          setStatusMessage(error instanceof Error ? error.message : "Failed to activate tier.");
        }
      }
    },
    [runnableTiers, selectedTier, selectedModel?.id]
  );

  const handleRerunBenchmark = useCallback(async () => {
    setRerunStatus("measuring");
    setRerunError("");
    try {
      await rerunBenchmark();
      const mediumAssignment = runnableTiers.medium;
      if (!mediumAssignment.downloaded) {
        throw new Error("Install a model first by picking a tier below.");
      }
      const rtf = await benchmarkTier(mediumAssignment.modelId);
      const fresh = await finalizeCalibration(rtf, mediumAssignment.modelId);
      setRunnableTiers(fresh);
      setRerunStatus("idle");
    } catch (error) {
      setRerunError(error instanceof Error ? error.message : "Re-run failed.");
      setRerunStatus("error");
    }
  }, [runnableTiers.medium]);

  const handleOpenWizard = useCallback(() => {
    setOnboardingCompleted(false);
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setOnboardingCompleted(true);
    setView("dictation");
    void refreshNativeState();
  }, [refreshNativeState]);

  const saveSession = useCallback(async (partial: Omit<LocalSession, "id" | "createdAt">) => {
    const session: LocalSession = {
      ...partial,
      id: createId("session"),
      createdAt: new Date().toISOString()
    };
    await saveLocalSession(session);
    setSessions((current) => [session, ...current].slice(0, 100));
    lastFinalTextRef.current = session.text;
    return session;
  }, []);

  const buildCompanionSnapshotForPhase = useCallback((phase: CompanionPhase, overrides: {
    enabled?: boolean;
    liveText?: string;
    statusMessage?: string;
    pasteStatus?: string;
    recordingStartedAt?: number;
  } = {}) => buildCompanionSnapshot({
    enabled: overrides.enabled ?? true,
    displayMode: companionDisplayMode,
    avatar: companionAvatar,
    customAvatarDataUrl: customCompanionAvatar?.dataUrl,
    customAvatarName: customCompanionAvatar?.name,
    phase,
    hotkey: formatShortcutForDisplay(hotkeys.dictation, hardwareProfile?.platform),
    liveText: overrides.liveText ?? liveText,
    statusMessage: overrides.statusMessage ?? statusMessage,
    pasteStatus: overrides.pasteStatus ?? pasteStatus,
    recordingStartedAt: overrides.recordingStartedAt,
    language: resolveTranscriptLanguage(language, overrides.liveText ?? liveText)
  }), [companionAvatar, companionDisplayMode, customCompanionAvatar?.dataUrl, customCompanionAvatar?.name, hardwareProfile?.platform, hotkeys.dictation, language, liveText, pasteStatus, statusMessage]);

  const presentCompanionWindow = useCallback(async (snapshot: ReturnType<typeof buildCompanionSnapshot>) => {
    if (!isTauriRuntime()) return;

    const companion = await TauriWindow.getByLabel("companion");
    if (!companion) return;

    if (!companionPositionedRef.current) {
      await positionCompanionWindow(companion, companionPosition);
      companionPositionedRef.current = true;
    }

    await companion.show();
    await emitTo("companion", "companion-state", snapshot);
  }, [companionPosition]);

  const startDictation = useCallback(async () => {
    if (isDictatingRef.current || recordingSetupPendingRef.current) {
      return;
    }

    if (transcriptionMode === "local" && !privateFastStatus.ready) {
      setStatusMessage(`${privateFastStatus.message} ${privateFastStatus.setupHint}`);
      setDictationPhase("blocked");
      setView("settings");
      return;
    }
    let activeCloudFastEntitlement = cloudFastEntitlement;
    if (transcriptionMode === "cloud-fast" && !cloudFastEntitlementChecked) {
      try {
        activeCloudFastEntitlement = await getCloudFastEntitlement();
        setCloudFastEntitlement(activeCloudFastEntitlement);
      } catch {
        activeCloudFastEntitlement = DEFAULT_CLOUD_FAST_ENTITLEMENT;
        setCloudFastEntitlement(DEFAULT_CLOUD_FAST_ENTITLEMENT);
      } finally {
        setCloudFastEntitlementChecked(true);
      }
    }
    if (transcriptionMode === "cloud-fast" && !activeCloudFastEntitlement.available) {
      setStatusMessage("Cloud Fast requires an active $6.99/month subscription. Local mode keeps working on this device.");
      setDictationPhase("blocked");
      return;
    }

    const previousLiveText = liveText;
    isDictatingRef.current = true;
    recordingSetupPendingRef.current = true;
    stopAfterRecordingSetupRef.current = false;
    stopSoundPlayedForCurrentRecordingRef.current = false;
    setCompanionDismissed(false);
    setCompanionEnabled(true);
    setIsDictating(true);
    setDictationPhase("recording");
    const startedAt = Date.now();
    const recordingText = transcriptionMode === "cloud-fast"
      ? "Recording for Cloud Fast. Stop to upload this audio for faster transcription."
      : "Recording locally. Stop to transcribe with the on-device engine.";
    setRecordingStartedAt(startedAt);
    setLiveText(recordingText);
    setStatusMessage("");
    setPasteStatus("");
    void presentCompanionWindow(buildCompanionSnapshotForPhase("recording", {
      liveText: recordingText,
      statusMessage: "",
      pasteStatus: "",
      recordingStartedAt: startedAt
    })).catch(() => undefined);

    // Auditory "the mic is open" confirmation. Fires before the actual
    // recording starts so the user hears it during the brief gap while
    // the mic stream is being constructed (~50-150 ms). The user picks
    // which sound they want in Settings → Companion → Start sound.
    playStartSound(startSound);

    try {
      // Pipe mic level bands to the companion floating window so it can
      // render the live waveform. We fire-and-forget the emit; if the
      // companion is hidden, nothing listens and the event drops.
      const recording = await startAudioRecording("microphone", "wav", (bands) => {
        void emitTo("companion", "companion-audio-levels", { bands });
      });
      recordingSetupPendingRef.current = false;
      dictationRecordingRef.current = recording;
      if (stopAfterRecordingSetupRef.current) {
        stopAfterRecordingSetupRef.current = false;
        void stopDictationRef.current?.();
      }
    } catch (error) {
      recordingSetupPendingRef.current = false;
      stopAfterRecordingSetupRef.current = false;
      stopSoundPlayedForCurrentRecordingRef.current = false;
      isDictatingRef.current = false;
      setIsDictating(false);
      setDictationPhase("error");
      setRecordingStartedAt(undefined);
      setLiveText(previousLiveText);
      setStatusMessage(error instanceof Error ? error.message : "Unable to start microphone recording.");
    }
  }, [buildCompanionSnapshotForPhase, cloudFastEntitlement, cloudFastEntitlementChecked, liveText, presentCompanionWindow, privateFastStatus.message, privateFastStatus.ready, privateFastStatus.setupHint, startSound, transcriptionMode]);

  const playStopSoundOnce = useCallback(() => {
    if (stopSoundPlayedForCurrentRecordingRef.current) return;
    stopSoundPlayedForCurrentRecordingRef.current = true;
    playRecordingStopSound();
  }, []);

  const stopDictation = useCallback(async () => {
    if (recordingSetupPendingRef.current && !dictationRecordingRef.current) {
      playStopSoundOnce();
      stopAfterRecordingSetupRef.current = true;
      setDictationPhase("processing");
      setRecordingStartedAt(undefined);
      setStatusMessage("Stopping recording as soon as the microphone is ready...");
      void presentCompanionWindow(buildCompanionSnapshotForPhase("processing", {
        statusMessage: "Stopping recording as soon as the microphone is ready...",
        recordingStartedAt: undefined
      })).catch(() => undefined);
      return;
    }

    const recording = dictationRecordingRef.current;
    dictationRecordingRef.current = null;
    if (!recording) {
      isDictatingRef.current = false;
      setIsDictating(false);
      setDictationPhase("error");
      setRecordingStartedAt(undefined);
      setStatusMessage("No active recording was found.");
      return;
    }

    playStopSoundOnce();
    isDictatingRef.current = false;
    setIsDictating(false);
    setDictationPhase("processing");
    setRecordingStartedAt(undefined);
    const processingMessage = transcriptionMode === "cloud-fast"
      ? "Transcribing with Cloud Fast..."
      : "Transcribing with local engine...";
    setStatusMessage(processingMessage);
    void presentCompanionWindow(buildCompanionSnapshotForPhase("processing", {
      statusMessage: processingMessage,
      recordingStartedAt: undefined
    })).catch(() => undefined);

    try {
      const clipboardBeforeTranscription = await getClipboardMarker().catch(() => null);
      const audio = await recording.stop();
      const durationSeconds = Math.max(1, Math.round((Date.now() - recording.startedAt) / 1000));
      const dictionaryValues = dictionaryForLanguage.map((term) => term.value);
      const snippetValues = snippetsForLanguage.map(({ trigger, replacement }) => ({ trigger, replacement }));
      const result = transcriptionMode === "cloud-fast"
        ? await runCloudFastDictation(audio, {
          clientSessionId: createId("cloud"),
          language,
          dictionary: dictionaryValues,
          snippets: snippetValues,
          mode: DEFAULT_DICTATION_MODE,
          durationSeconds,
          appVersion,
          platform: hardwareProfile?.platform,
          localProcessing
        })
        : await runLocalDictation(audio, {
          language,
          dictionary: dictionaryValues,
          snippets: snippetValues,
          mode: DEFAULT_DICTATION_MODE,
          profile: tierToProfile(selectedTier),
          localProcessing
        });

      const resultLanguage = result.language ?? resolveTranscriptLanguage(language, result.finalizedText);
      const wordCount = countWords(result.finalizedText, resultLanguage);
      let pasteResult: Awaited<ReturnType<typeof pasteText>> | undefined;
      let pasteWarning = "";
      let pasteError = "";
      let saveError = "";

      try {
        pasteResult = await pasteText(result.finalizedText, clipboardBeforeTranscription);
      } catch (error) {
        pasteWarning = error instanceof Error ? error.message : "Clipboard paste failed.";
        try {
          const copyResult = await copyText(result.finalizedText);
          pasteResult = {
            pasted: false,
            copied: copyResult.copied,
            method: copyResult.method ? `fallback-${copyResult.method}` : "fallback-clipboard"
          };
        } catch (copyError) {
          const copyMessage = copyError instanceof Error ? copyError.message : "Clipboard copy failed.";
          pasteError = `${pasteWarning}; clipboard fallback failed: ${copyMessage}`;
        }
      }

      lastFinalTextRef.current = result.finalizedText;
      try {
        await saveSession({
          title: `Message ${new Date().toLocaleTimeString()}`,
          mode: DEFAULT_DICTATION_MODE,
          language: resultLanguage,
          privacyMode: transcriptionMode === "cloud-fast" ? "cloud-fast" : "local-only",
          provider: transcriptionMode === "cloud-fast" ? "cloud-fast" : "local-whisper",
          durationSeconds,
          wordCount,
          rawText: result.rawText,
          text: result.finalizedText
        });
      } catch (error) {
        saveError = error instanceof Error ? error.message : "History save failed.";
      }

      setLiveText(result.finalizedText);
      setDictationPhase("complete");
      const nextPasteStatus =
        pasteResult?.pasted
          ? "Pasted into active app"
          : pasteResult?.method === "clipboard-changed-copied"
            ? "Copied; auto paste skipped"
            : pasteResult?.copied
              ? "Copied to clipboard"
              : "Transcript kept in Dictivo";
      setPasteStatus(nextPasteStatus);
      let completionMessage: string;
      if (transcriptionMode === "cloud-fast") {
        completionMessage = result.fallbackUsed
          ? "Cloud Fast completed through the backup route."
          : "Cloud Fast transcription completed.";
      } else if (result.fallbackUsed) {
        completionMessage = `Local transcription completed with fast fallback after ${selectedTier} profile failed.`;
      } else if ("slowWarning" in result && typeof result.slowWarning === "string") {
        completionMessage = result.slowWarning;
      } else {
        completionMessage = `Local transcription completed with ${"profileUsed" in result ? result.profileUsed : "balanced"} profile.`;
      }
      const nextStatusMessage =
        pasteError && saveError
          ? `${completionMessage} Transcript is shown here, but paste/copy failed (${pasteError}) and history could not be saved (${saveError}).`
          : pasteError
            ? `${completionMessage} Transcript is shown here, but could not be pasted or copied: ${pasteError}`
            : saveError
              ? `${completionMessage} Transcript is ready, but history could not be saved: ${saveError}`
              : pasteWarning && pasteResult?.copied
                ? `${completionMessage} Auto paste failed (${pasteWarning}), so Dictivo copied the transcript to the clipboard.`
              : pasteResult?.method === "clipboard-changed-copied"
          ? `${completionMessage} The clipboard changed during transcription, so Dictivo copied the transcript but skipped automatic paste. Press ${manualPasteShortcut(hardwareProfile?.platform)} to paste it.`
          : pasteResult?.copied
            ? completionMessage
            : `${completionMessage} Transcript is available in Dictivo, but could not be copied to the clipboard.`;
      setStatusMessage(nextStatusMessage);
      void presentCompanionWindow(buildCompanionSnapshotForPhase("complete", {
        liveText: result.finalizedText,
        statusMessage: nextStatusMessage,
        pasteStatus: nextPasteStatus,
        recordingStartedAt: undefined
      })).catch(() => undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : `${transcriptionMode === "cloud-fast" ? "Cloud Fast" : "Local"} dictation failed.`;
      setDictationPhase("error");
      setStatusMessage(message);
      setPasteStatus("");
      setLiveText((current) => current.startsWith("Recording ") ? "" : current);
      void presentCompanionWindow(buildCompanionSnapshotForPhase("error", {
        liveText: "",
        statusMessage: message,
        pasteStatus: "",
        recordingStartedAt: undefined
      })).catch(() => undefined);
    }
  }, [appVersion, buildCompanionSnapshotForPhase, dictionaryForLanguage, hardwareProfile?.platform, language, localProcessing, playStopSoundOnce, presentCompanionWindow, saveSession, selectedTier, snippetsForLanguage, transcriptionMode]);

  const toggleDictation = useCallback(() => {
    if (isDictatingRef.current) {
      void stopDictation();
    } else {
      void startDictation();
    }
  }, [startDictation, stopDictation]);

  useEffect(() => {
    isDictatingRef.current = isDictating;
  }, [isDictating]);

  useEffect(() => {
    startDictationRef.current = startDictation;
    stopDictationRef.current = stopDictation;
  }, [startDictation, stopDictation]);

  const pasteLastTranscript = useCallback(async () => {
    const text = lastFinalTextRef.current || sessions[0]?.text || liveText;
    if (!text.trim()) {
      setStatusMessage("No transcript available to paste yet.");
      return;
    }

    try {
      const result = await pasteText(text);
      setDictationPhase("complete");
      setPasteStatus(result.pasted ? "Pasted last transcript" : "Copied last transcript");
      setStatusMessage("Last local transcript is ready in the target app or clipboard.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to paste last transcript.");
    }
  }, [liveText, sessions]);

  const clearHistory = useCallback(async () => {
    setStatusMessage("");
    setHistoryOperation("clear");
    try {
      await clearLocalSessions();
      const remaining = await listLocalSessions();
      setSessions(remaining);
      lastFinalTextRef.current = remaining[0]?.text ?? "";
      setQuery("");
      setStatusMessage(
        remaining.length === 0
          ? "Local history cleared."
          : "History clear did not remove every session. Restart Dictivo and try again."
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to clear local history.");
    } finally {
      setHistoryOperation("");
    }
  }, []);

  const deleteHistorySession = useCallback(async (sessionId: string) => {
    setStatusMessage("");
    setHistoryOperation(`delete:${sessionId}`);
    try {
      await deleteLocalSession(sessionId);
      const remaining = await listLocalSessions();
      setSessions(remaining);
      lastFinalTextRef.current = remaining[0]?.text ?? "";
      setStatusMessage("Message deleted.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to delete message.");
    } finally {
      setHistoryOperation("");
    }
  }, []);

  const copyHistoryText = useCallback(async (session: LocalSession, kind: "raw" | "final") => {
    const text = kind === "raw" ? session.rawText ?? "" : session.text;
    const label = kind === "raw" ? "Raw transcript" : "Final text";
    if (!text.trim()) {
      setStatusMessage(`${label} is empty.`);
      return;
    }

    setStatusMessage("");
    setHistoryOperation(`copy:${session.id}:${kind}`);
    try {
      await copyText(text);
      setPasteStatus(`${label} copied`);
      setStatusMessage(`${label} copied to clipboard.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : `Unable to copy ${label.toLowerCase()}.`);
    } finally {
      setHistoryOperation("");
    }
  }, []);

  const pasteHistorySession = useCallback(async (session: LocalSession) => {
    if (!session.text.trim()) {
      setStatusMessage("This history message has no final text to paste.");
      return;
    }

    setStatusMessage("");
    setHistoryOperation(`paste:${session.id}`);
    try {
      const result = await pasteText(session.text);
      lastFinalTextRef.current = session.text;
      setPasteStatus(result.pasted ? "Pasted history message" : "Copied history message");
      setStatusMessage(result.pasted ? "History message pasted." : "History message copied to clipboard.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to paste history message.");
    } finally {
      setHistoryOperation("");
    }
  }, []);

  useEffect(() => {
    pasteLastTranscriptRef.current = pasteLastTranscript;
  }, [pasteLastTranscript]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      setHotkeyStatus("Web preview only");
      return;
    }

    const shortcuts = uniqueShortcuts([hotkeys.dictation, hotkeys.pasteLast]);
    if (shortcuts.length === 0) {
      setHotkeyStatus("No hotkeys configured");
      return;
    }

    let disposed = false;
    const cleanupShortcuts = () => void unregister(shortcuts).catch(() => undefined);
    setHotkeyStatus("Registering hotkeys...");
    register(shortcuts, (event) => {
      const intent = resolveHotkeyIntent(event, hotkeys, isDictatingRef.current);
      if (intent === "start-dictation") void startDictationRef.current?.();
      if (intent === "stop-dictation") void stopDictationRef.current?.();
      if (intent === "paste-last") void pasteLastTranscriptRef.current?.();
    })
      .then(async () => {
        if (disposed) {
          cleanupShortcuts();
          return;
        }

        const unavailable = [];
        for (const shortcut of shortcuts) {
          if (!(await isRegistered(shortcut))) unavailable.push(shortcut);
        }

        if (disposed) {
          cleanupShortcuts();
          return;
        }
        if (unavailable.length > 0) {
          cleanupShortcuts();
          setHotkeyStatus("Hotkey unavailable");
          setStatusMessage(`Unable to reserve global hotkey: ${unavailable.join(", ")}`);
          return;
        }

        setHotkeyStatus(`${hotkeys.dictation} ready`);
      })
      .catch((error: unknown) => {
        cleanupShortcuts();
        if (!disposed) {
          setHotkeyStatus("Hotkey unavailable");
          setStatusMessage(error instanceof Error ? error.message : "Unable to register global hotkeys.");
        }
      });

    return () => {
      disposed = true;
      cleanupShortcuts();
    };
  }, [hotkeys.activationMode, hotkeys.dictation, hotkeys.pasteLast]);

  const companionSnapshot = useMemo(
    () =>
      buildCompanionSnapshot({
        enabled: companionEnabled,
        displayMode: companionDisplayMode,
        avatar: companionAvatar,
        customAvatarDataUrl: customCompanionAvatar?.dataUrl,
        customAvatarName: customCompanionAvatar?.name,
        phase: dictationPhase,
        hotkey: formatShortcutForDisplay(hotkeys.dictation, hardwareProfile?.platform),
        liveText,
        statusMessage,
        pasteStatus,
        recordingStartedAt,
        language: resolveTranscriptLanguage(language, liveText)
      }),
    [companionAvatar, companionDisplayMode, companionEnabled, customCompanionAvatar?.dataUrl, customCompanionAvatar?.name, dictationPhase, hardwareProfile?.platform, hotkeys.dictation, language, liveText, pasteStatus, recordingStartedAt, statusMessage]
  );

  const showCompanionWindow = useCallback(async () => {
    setCompanionEnabled(true);
    setCompanionDismissed(false);
    setStatusMessage("");

    if (!isTauriRuntime()) return;

    try {
      const companion = await TauriWindow.getByLabel("companion");
      if (!companion) {
        setStatusMessage("Floating companion window is unavailable.");
        return;
      }

      if (!companionPositionedRef.current) {
        await positionCompanionWindow(companion, companionPosition);
        companionPositionedRef.current = true;
      }

      await companion.show();
      await emitTo("companion", "companion-state", { ...companionSnapshot, enabled: true });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to show floating companion.");
    }
  }, [companionPosition, companionSnapshot]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;

    const handleUrl = (url: string) => {
      const parsed = parseDeepLink(url);
      if (!parsed || (parsed.kind !== "activate" && parsed.kind !== "activate-cloud-fast")) return;
      if (!activationLimiterRef.current.allow()) return;
      if (parsed.kind === "activate") {
        setPendingLicenseKey(parsed.licenseKey);
      } else {
        setPendingCloudFastLicenseKey(parsed.licenseKey);
      }
      setView("settings");
    };

    void (async () => {
      try {
        const { onOpenUrl, getCurrent } = await import("@tauri-apps/plugin-deep-link");
        const cold = await getCurrent();
        if (!disposed && cold) cold.forEach(handleUrl);
        unsubscribe = await onOpenUrl((urls: string[]) => {
          if (!disposed) urls.forEach(handleUrl);
        });
        if (disposed && unsubscribe) unsubscribe();
      } catch (error) {
        // Plugin missing or denied — deep links degrade gracefully to the
        // manual "paste license key" flow. Never surface this to the user.
        console.warn("deepLink: subscription failed", error);
      }
    })();

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    const cleanups: Array<() => void> = [];
    const register = (channel: string, handler: (payload: unknown) => void) => {
      // Tauri's real listen() passes `{ payload }`. Some test mocks pass the
      // raw payload (or nothing); accept both shapes so a test-side mock
      // shape mismatch never crashes the production handler.
      void listen(channel, (event: unknown) => {
        if (event && typeof event === "object" && "payload" in event) {
          handler((event as { payload: unknown }).payload);
        } else {
          handler(event);
        }
      }).then((cleanup) => {
        if (disposed) cleanup();
        else cleanups.push(cleanup);
      });
    };

    register("companion-hide-requested", () => {
      setCompanionDismissed(true);
      setStatusMessage("Floating companion hidden until the next dictation.");
      void TauriWindow.getByLabel("companion").then((companion) => {
        if (companion) void companion.hide();
      }).catch(() => undefined);
    });

    // F — long-press menu actions.
    register("companion-open-settings", () => {
      setView("settings");
      void TauriWindow.getByLabel("main").then((main) => {
        if (!main) return;
        void main.show();
        void main.unminimize();
        void main.setFocus();
      }).catch(() => undefined);
    });
    register("companion-show-main", () => {
      void TauriWindow.getByLabel("main").then((main) => {
        if (!main) return;
        void main.show();
        void main.unminimize();
        void main.setFocus();
      }).catch(() => undefined);
    });

    // E — companion just settled at a new position (drag end, possibly with
    // edge snap applied). Persist it so the next launch reopens the widget
    // exactly where the user left it.
    register("companion-position-changed", (payload) => {
      if (!payload || typeof payload !== "object") return;
      const { x, y } = payload as { x?: unknown; y?: unknown };
      if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
        setCompanionPosition({ x: Math.round(x), y: Math.round(y) });
      }
    });

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    const syncCompanion = async () => {
      const companion = await TauriWindow.getByLabel("companion");
      if (!companion || disposed) return;

      if (!companionSnapshot.enabled || companionDismissed) {
        await companion.hide();
        return;
      }

      if (!companionPositionedRef.current) {
        await positionCompanionWindow(companion, companionPosition);
        companionPositionedRef.current = true;
      }

      await companion.show();
      await emitTo("companion", "companion-state", companionSnapshot);
    };

    void syncCompanion().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unable to sync floating companion.";
      setStatusMessage((current) => current || message);
    });

    return () => {
      disposed = true;
    };
  }, [companionDismissed, companionPosition, companionSnapshot]);

  const addDictionaryTerm = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const normalized = trimmed.toLocaleLowerCase();
    const termLanguage = resolveTranscriptLanguage(language, trimmed);
    setDictionary((current) => {
      if (current.some((item) => item.language === termLanguage && item.value.trim().toLocaleLowerCase() === normalized)) return current;
      return [
        { id: createId("term"), value: trimmed, language: termLanguage, createdAt: new Date().toISOString() },
        ...current
      ];
    });
  }, [language]);

  const addSnippet = useCallback((trigger: string, replacement: string) => {
    const trimmedTrigger = trigger.trim();
    const trimmedReplacement = replacement.trim();
    if (!trimmedTrigger || !trimmedReplacement) return;
    const normalizedTrigger = trimmedTrigger.toLocaleLowerCase();
    const snippetLanguage = resolveTranscriptLanguage(language, `${trimmedTrigger} ${trimmedReplacement}`);
    setSnippets((current) => {
      if (current.some((item) => item.language === snippetLanguage && item.trigger.trim().toLocaleLowerCase() === normalizedTrigger)) return current;
      return [
        {
          id: createId("snippet"),
          trigger: trimmedTrigger,
          replacement: trimmedReplacement,
          language: snippetLanguage,
          createdAt: new Date().toISOString()
        },
        ...current
      ];
    });
  }, [language]);

  const runPrivateFastModelAction = useCallback(
    async (action: "select" | "download" | "delete", modelId: string) => {
      setPrivateFastOperation(`${action}:${modelId}`);
      setStatusMessage("");

      try {
        const nextStatus =
          action === "select"
            ? await selectPrivateFastModel(modelId)
            : action === "download"
              ? await downloadPrivateFastModel(modelId)
              : await deletePrivateFastModel(modelId);
        setPrivateFastStatus(nextStatus);
        setPrivateFastModels(await getPrivateFastModels());
        setStatusMessage(action === "delete" ? "Local model deleted." : action === "download" ? "Local model downloaded and selected." : "Local model selected.");
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Local model operation failed.");
      } finally {
        setPrivateFastOperation("");
      }
    },
    []
  );

  const runImportModel = useCallback(async (modelId: string, sourcePath: string) => {
    const trimmed = sourcePath.trim();
    if (!trimmed) {
      setStatusMessage("Enter a local model file path to import.");
      return;
    }

    setPrivateFastOperation(`import:${modelId}`);
    try {
      const nextStatus = await importPrivateFastModel(modelId, trimmed);
      setPrivateFastStatus(nextStatus);
      setPrivateFastModels(await getPrivateFastModels());
      setStatusMessage("Local model imported and selected.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Local model import failed.");
    } finally {
      setPrivateFastOperation("");
    }
  }, []);

  const handleOpenPermissionSettings = useCallback(async (target: PermissionSettingsTarget) => {
    try {
      await openPermissionSettings(target);
      setStatusMessage("Opened system settings. Refresh local status after granting the permission.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to open system settings.");
    }
  }, []);

  const updateHotkey = useCallback((key: keyof HotkeySettings, value: string) => {
    setHotkeys((current) => normalizeHotkeys({ ...current, [key]: value }));
  }, []);

  const updateProcessingSetting = useCallback((key: keyof LocalProcessingSettings, value: boolean) => {
    setLocalProcessing((current) => ({
      ...current,
      [key]: value
    }));
  }, []);

  const updateCustomCompanionAvatar = useCallback((avatar: CustomCompanionAvatar | null) => {
    setCustomCompanionAvatar(avatar);
    setCompanionAvatar((current) => {
      if (avatar) return "custom";
      return current === "custom" ? "dog" : current;
    });
  }, []);

  const handleUpgradeCloudFast = useCallback(() => {
    const url = cloudFastEntitlement.upgradeUrl || "https://dictivo.app/cloud-fast";
    void openExternalUrl(url).catch((error: unknown) => {
      setStatusMessage(error instanceof Error ? error.message : "Unable to open Cloud Fast upgrade link.");
    });
  }, [cloudFastEntitlement.upgradeUrl]);

  const handleManageCloudFastBilling = useCallback(() => {
    const url = cloudFastEntitlement.billingPortalUrl || "https://app.lemonsqueezy.com/my-orders";
    void openExternalUrl(url).catch((error: unknown) => {
      setStatusMessage(error instanceof Error ? error.message : "Unable to open Cloud Fast billing.");
    });
  }, [cloudFastEntitlement.billingPortalUrl]);

  if (!onboardingCompleted) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} />;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <div className="brand-mark">D</div>

        <nav className="nav-list">
          <NavButton active={view === "dictation"} label="Dictation" icon={<TerminalSquare size={18} />} onClick={() => setView("dictation")} />
          <NavButton active={view === "history"} label="History" icon={<History size={18} />} onClick={() => setView("history")} />
          <NavButton active={view === "dictionary"} label="Dictionary" icon={<BookOpenText size={18} />} onClick={() => setView("dictionary")} />
          <NavButton active={view === "settings"} label="Settings" icon={<Settings size={18} />} onClick={() => setView("settings")} />
        </nav>

        <SidebarMascot
          avatar={companionAvatar}
          customAvatar={customCompanionAvatar}
          onClick={() => void showCompanionWindow()}
        />
      </aside>

      <section className={`workspace workspace--${view}`}>
        <header className="topbar">
          {view === "dictation" ? (
            <div className="heading-block">
              <div className="title-row">
                <h1>Private Dictation.</h1>
                <span className="beta-chip">BETA</span>
              </div>
              <p className="promise">
                Local keeps audio on this device. Cloud Fast uploads audio to cloud transcription providers for faster results.
              </p>
            </div>
          ) : (
            <div className="heading-block">
              <div className="title-row">
                <h1>{viewTitle(view)}</h1>
              </div>
            </div>
          )}
          {view === "dictation" && (
            <div className="toolbar" aria-label="Dictation defaults">
              <span className="auto-language-chip">Auto language</span>
            </div>
          )}
        </header>

        {statusMessage && (
          <div className="status-banner" aria-live="polite">
            {statusMessage}
          </div>
        )}

        <UpdateBanner onRenewClick={() => setView("settings")} />

        {view === "dictation" && (
          <DictationWorkbench
            language={language}
            transcriptionMode={transcriptionMode}
            cloudFastEntitlement={cloudFastEntitlement}
            isDictating={isDictating}
            liveText={liveText}
            hotkeyStatus={hotkeyStatus}
            pasteStatus={pasteStatus}
            privateFastStatus={privateFastStatus}
            hardwareProfile={hardwareProfile}
            selectedModel={selectedModel}
            runnableTiers={runnableTiers}
            selectedTier={selectedTier}
            hotkeys={hotkeys}
            companionAvatar={companionAvatar}
            companionEnabled={companionEnabled}
            customCompanionAvatar={customCompanionAvatar}
            onTranscriptionModeChange={setTranscriptionMode}
            onTierChange={(tier) => void handleTierChange(tier)}
            onUpgradeCloudFast={handleUpgradeCloudFast}
            onToggleDictation={toggleDictation}
            onLiveTextChange={setLiveText}
            onOpenHistory={() => setView("history")}
            onDisableCompanion={() => setCompanionEnabled(false)}
          />
        )}

        {view === "history" && (
          <HistoryView
            sessions={sessions}
            query={query}
            onQueryChange={setQuery}
            onClear={() => void clearHistory()}
            onDeleteSession={(sessionId) => void deleteHistorySession(sessionId)}
            onCopyText={(session, kind) => void copyHistoryText(session, kind)}
            onPasteSession={(session) => void pasteHistorySession(session)}
            isClearing={historyOperation === "clear"}
            copyingSessionId={historyOperation.startsWith("copy:") ? historyOperation.slice("copy:".length) : undefined}
            deletingSessionId={historyOperation.startsWith("delete:") ? historyOperation.slice("delete:".length) : undefined}
            pastingSessionId={historyOperation.startsWith("paste:") ? historyOperation.slice("paste:".length) : undefined}
          />
        )}

        {view === "dictionary" && (
          <DictionaryView
            dictionary={dictionaryForLanguage}
            snippets={snippetsForLanguage}
            onAddTerm={addDictionaryTerm}
            onAddSnippet={addSnippet}
            onRemoveTerm={(id) => setDictionary((current) => current.filter((item) => item.id !== id))}
            onRemoveSnippet={(id) => setSnippets((current) => current.filter((item) => item.id !== id))}
          />
        )}

        {view === "settings" && (
          <SettingsView
            appVersion={appVersion}
            transcriptionMode={transcriptionMode}
            cloudFastEntitlement={cloudFastEntitlement}
            initialSection={pendingLicenseKey || pendingCloudFastLicenseKey ? "license" : undefined}
            pendingLicenseKey={pendingLicenseKey}
            pendingCloudFastLicenseKey={pendingCloudFastLicenseKey}
            onLicenseKeyConsumed={() => setPendingLicenseKey("")}
            onCloudFastLicenseKeyConsumed={() => setPendingCloudFastLicenseKey("")}
            onCloudFastLicenseChange={refreshCloudFastEntitlement}
            hotkeys={hotkeys}
            localProcessing={localProcessing}
            permissions={permissions}
            privateFastStatus={privateFastStatus}
            privateFastModels={privateFastModels}
            privateFastOperation={privateFastOperation}
            companionEnabled={companionEnabled}
            companionDisplayMode={companionDisplayMode}
            companionAvatar={companionAvatar}
            customCompanionAvatar={customCompanionAvatar}
            hardwareProfile={hardwareProfile}
            runnableTiers={runnableTiers}
            onHotkeyChange={updateHotkey}
            onTranscriptionModeChange={setTranscriptionMode}
            onUpgradeCloudFast={handleUpgradeCloudFast}
            onManageCloudFastBilling={handleManageCloudFastBilling}
            onProcessingChange={updateProcessingSetting}
            onCompanionEnabledChange={setCompanionEnabled}
            onCompanionDisplayModeChange={setCompanionDisplayMode}
            onCompanionAvatarChange={setCompanionAvatar}
            onCustomCompanionAvatarChange={updateCustomCompanionAvatar}
            startSound={startSound}
            onStartSoundChange={setStartSound}
            onModelAction={(action, modelId) => void runPrivateFastModelAction(action, modelId)}
            onImportModel={(modelId, sourcePath) => void runImportModel(modelId, sourcePath)}
            onRefreshNative={() => void refreshNativeState()}
            onOpenPermissionSettings={(target) => void handleOpenPermissionSettings(target)}
            selectedTier={selectedTier}
            rerunStatus={rerunStatus}
            rerunError={rerunError}
            onTierChange={(tier) => void handleTierChange(tier)}
            onRerunBenchmark={() => void handleRerunBenchmark()}
            onOpenWizard={handleOpenWizard}
          />
        )}
      </section>
    </main>
  );
}

function NavButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`nav-button ${active ? "is-active" : ""}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}

function SidebarMascot({
  avatar,
  customAvatar,
  onClick
}: {
  avatar: CompanionAvatar;
  customAvatar: CustomCompanionAvatar | null;
  onClick: () => void;
}) {
  return (
    <button type="button" className="sidebar-mascot" title="Show floating companion" aria-label="Show floating companion" onClick={onClick}>
      <MascotGlyph avatar={avatar} customAvatar={customAvatar} />
    </button>
  );
}

function MascotGlyph({ avatar, customAvatar }: { avatar: CompanionAvatar; customAvatar: CustomCompanionAvatar | null }) {
  if (avatar === "custom" && customAvatar) {
    return <img src={customAvatar.dataUrl} alt="" draggable={false} />;
  }
  if (avatar === "cat") {
    return (
      <svg viewBox="0 0 96 96" role="img" aria-label="Cartoon cat">
        <path d="M24 35 18 13l22 14m32 8 6-22-22 14" fill="#5a6970" />
        <circle cx="48" cy="52" r="31" fill="#7f9299" />
        <circle cx="36" cy="48" r="4" fill="#0b1112" />
        <circle cx="60" cy="48" r="4" fill="#0b1112" />
        <path d="M43 56h10l-5 6z" fill="#ffb7c5" />
      </svg>
    );
  }
  if (avatar === "iris") return <img src={irisAvatarImage} alt="" draggable={false} />;
  if (avatar === "marcus") return <img src={marcusAvatarImage} alt="" draggable={false} />;
  return (
    <svg viewBox="0 0 96 96" role="img" aria-label="Cartoon dog">
      <circle cx="48" cy="52" r="31" fill="#d89954" />
      <circle cx="36" cy="48" r="4" fill="#1a1210" />
      <circle cx="60" cy="48" r="4" fill="#1a1210" />
      <path d="M42 59c4 3 8 3 12 0" fill="none" stroke="#1a1210" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function viewTitle(view: View) {
  if (view === "history") return "Local History";
  if (view === "dictionary") return "Dictionary & Snippets";
  if (view === "settings") return "Settings";
  return "Dictation";
}

function countWords(text: string, language: SupportedLanguage) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  if (language === "zh" || language === "ja") return [...trimmed.replace(/\s+/g, "")].length;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function tierToProfile(tier: Tier): "fast" | "balanced" | "quality" {
  if (tier === "fast") return "fast";
  if (tier === "slow") return "quality";
  return "balanced";
}

function markTierBenchmarked(tiers: RunnableTiers, tier: Tier, realtimeFactor: number): RunnableTiers {
  return {
    ...tiers,
    [tier]: {
      ...tiers[tier],
      realtimeFactor,
      predicted: false,
      downloaded: true,
      withinBudget: realtimeFactor <= tierBudget(tier)
    },
    benchmarkedAt: new Date().toISOString()
  };
}

function tierBudget(tier: Tier) {
  if (tier === "fast") return 1.0;
  if (tier === "medium") return 2.0;
  return 4.0;
}

function manualPasteShortcut(platform?: HardwareProfile["platform"]) {
  return platform === "macos" ? "Command+V" : "Ctrl+V";
}

function placeholderRunnableTiers(): RunnableTiers {
  const empty = {
    modelId: "",
    realtimeFactor: 0,
    predicted: true,
    downloaded: false,
    withinBudget: false
  };
  return {
    fast: { ...empty, modelId: "base" },
    medium: { ...empty, modelId: "small" },
    slow: { ...empty, modelId: "large-v3" },
    fingerprint: "",
    benchmarkedAt: ""
  };
}

async function positionCompanionWindow(window: TauriWindow, override?: { x: number; y: number } | null) {
  const size = await window.outerSize();
  const workAreas = await availableCompanionWorkAreas();

  if (override) {
    // The user explicitly placed the companion on a previous launch; honor
    // that exact position while it still intersects a connected display. If
    // the monitor went away, fall through to the default visible anchor.
    if (workAreas.length === 0 || workAreas.some((area) => windowIntersectsWorkArea(override, size, area))) {
      await window.setPosition(new PhysicalPosition(override.x, override.y));
      return;
    }
  }

  const monitor = await primaryMonitor();
  if (!monitor) return;

  const position = companionWindowPosition(monitor.workArea, size);
  await window.setPosition(new PhysicalPosition(position.x, position.y));
}

async function availableCompanionWorkAreas(): Promise<WorkArea[]> {
  try {
    const monitors = await availableMonitors();
    return monitors.map((monitor) => monitor.workArea);
  } catch {
    return [];
  }
}
