import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { PhysicalPosition, Window as TauriWindow, primaryMonitor } from "@tauri-apps/api/window";
import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { BookOpenText, History, Settings, TerminalSquare } from "lucide-react";
import trumpAvatarImage from "./assets/avatars/trump-companion.png";
import bikiniAvatarImage from "./assets/avatars/bikini-companion.png";
import muscleAvatarImage from "./assets/avatars/muscle-companion.png";
import {
  LANGUAGE_LABELS,
  type DictionaryTerm,
  type InputMode,
  type LocalSession,
  type Snippet,
  type SupportedLanguage
} from "@dictivo/shared";
import { createId } from "./lib/id";
import { startAudioRecording, type RecordingController } from "./lib/mediaCapture";
import { runLocalDictation } from "./lib/localDictationEngine";
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
  type CompanionAvatar
} from "./lib/settingsStore";
import { buildCompanionSnapshot, type CompanionPhase } from "./lib/companion";
import { companionWindowPosition } from "./lib/companionWindowPosition";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { DictationWorkbench } from "./components/DictationWorkbench";
import { CompanionWindow } from "./components/CompanionWindow";
import { HistoryView } from "./components/HistoryView";
import { DictionaryView } from "./components/DictionaryView";
import { SettingsView } from "./components/SettingsView";
import { resolveHotkeyIntent, uniqueShortcuts } from "./lib/hotkeys";
import { BUNDLED_APP_VERSION, getAppVersion } from "./lib/version";

type View = "dictation" | "history" | "dictionary" | "settings";

type AppProps = {
  windowLabel?: string;
};

const DEFAULT_DICTATION_MODE: InputMode = "message";

export function App({ windowLabel = "main" }: AppProps) {
  if (windowLabel === "companion") return <CompanionWindow />;

  const initialSettings = useMemo(() => loadSettings(), []);
  const [view, setView] = useState<View>("dictation");
  const [language, setLanguage] = useState<SupportedLanguage>(initialSettings.language);
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
  const [companionAvatar, setCompanionAvatar] = useState<CompanionAvatar>(initialSettings.companionAvatar);
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

  const dictationRecordingRef = useRef<RecordingController | null>(null);
  const isDictatingRef = useRef(false);
  const companionPositionedRef = useRef(false);
  const lastFinalTextRef = useRef("");
  const startDictationRef = useRef<(() => Promise<void>) | null>(null);
  const stopDictationRef = useRef<(() => Promise<void>) | null>(null);
  const pasteLastTranscriptRef = useRef<(() => Promise<void>) | null>(null);

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
    () => dictionary.filter((term) => term.language === language),
    [dictionary, language]
  );
  const snippetsForLanguage = useMemo(
    () => snippets.filter((snippet) => snippet.language === language),
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
      setPrivateFastStatus(status);
      setPrivateFastModels(models);
      setHardwareProfile(hardware);
      setPermissions(permissionState as Record<string, string>);
    } catch (error) {
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
      selectedTier,
      onboardingCompleted,
      companionEnabled,
      companionAvatar,
      hotkeys,
      localProcessing,
      dictionary,
      snippets
    });
  }, [companionAvatar, companionEnabled, dictionary, hotkeys, language, localProcessing, onboardingCompleted, selectedTier, snippets]);

	useEffect(() => {
	  void getRunnableTiers()
	    .then(setRunnableTiers)
	    .catch((error: unknown) => {
	      setStatusMessage(error instanceof Error ? error.message : "Unable to load local engine tier cache.");
	    });
	}, [onboardingCompleted]);

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
  }, []);

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

  const startDictation = useCallback(async () => {
    if (isDictatingRef.current) {
      return;
    }

    if (!privateFastStatus.ready) {
      setStatusMessage(`${privateFastStatus.message} ${privateFastStatus.setupHint}`);
      setDictationPhase("blocked");
      setView("settings");
      return;
    }

    const previousLiveText = liveText;
    isDictatingRef.current = true;
    setIsDictating(true);
    setDictationPhase("recording");
    setRecordingStartedAt(Date.now());
    setLiveText("Recording locally. Stop to transcribe with the on-device engine.");
    setStatusMessage("");
    setPasteStatus("");

    try {
      dictationRecordingRef.current = await startAudioRecording("microphone", "wav");
    } catch (error) {
      isDictatingRef.current = false;
      setIsDictating(false);
      setDictationPhase("error");
      setRecordingStartedAt(undefined);
      setLiveText(previousLiveText);
      setStatusMessage(error instanceof Error ? error.message : "Unable to start microphone recording.");
    }
  }, [liveText, privateFastStatus.message, privateFastStatus.ready, privateFastStatus.setupHint]);

  const stopDictation = useCallback(async () => {
    isDictatingRef.current = false;
    setIsDictating(false);
    setDictationPhase("processing");
    setRecordingStartedAt(undefined);
    setStatusMessage("Transcribing with local engine...");

    const recording = dictationRecordingRef.current;
    dictationRecordingRef.current = null;
    if (!recording) {
      setDictationPhase("error");
      setStatusMessage("No active recording was found.");
      return;
    }

    try {
      const clipboardBeforeTranscription = await getClipboardMarker().catch(() => null);
      const audio = await recording.stop();
      const durationSeconds = Math.max(1, Math.round((Date.now() - recording.startedAt) / 1000));
      const dictionaryValues = dictionaryForLanguage.map((term) => term.value);
      const snippetValues = snippetsForLanguage.map(({ trigger, replacement }) => ({ trigger, replacement }));
      const result = await runLocalDictation(audio, {
        language,
        dictionary: dictionaryValues,
        snippets: snippetValues,
        mode: DEFAULT_DICTATION_MODE,
        profile: tierToProfile(selectedTier),
        localProcessing
      });

      const wordCount = countWords(result.finalizedText, language);
      let pasteResult: Awaited<ReturnType<typeof pasteText>> | undefined;
      let pasteError = "";
      let saveError = "";

      try {
        pasteResult = await pasteText(result.finalizedText, clipboardBeforeTranscription);
      } catch (error) {
        pasteError = error instanceof Error ? error.message : "Clipboard paste failed.";
      }

      lastFinalTextRef.current = result.finalizedText;
      try {
        await saveSession({
          title: `Message ${new Date().toLocaleTimeString()}`,
          mode: DEFAULT_DICTATION_MODE,
          language,
          privacyMode: "local-only",
          provider: "local-whisper",
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
      setPasteStatus(
        pasteResult?.pasted
          ? "Pasted into active app"
          : pasteResult?.method === "clipboard-changed-copied"
            ? "Copied; auto paste skipped"
            : pasteResult?.copied
              ? "Copied to clipboard"
              : "Transcript kept in Dictivo"
      );
      const completionMessage =
        result.fallbackUsed
          ? `Local transcription completed with fast fallback after ${selectedTier} profile failed.`
          : result.slowWarning
            ? result.slowWarning
            : `Local transcription completed with ${result.profileUsed} profile.`;
      setStatusMessage(
        pasteError && saveError
          ? `${completionMessage} Transcript is shown here, but paste/copy failed (${pasteError}) and history could not be saved (${saveError}).`
          : pasteError
            ? `${completionMessage} Transcript is shown here, but could not be pasted or copied: ${pasteError}`
            : saveError
              ? `${completionMessage} Transcript is ready, but history could not be saved: ${saveError}`
              : pasteResult?.method === "clipboard-changed-copied"
          ? `${completionMessage} The clipboard changed during transcription, so Dictivo copied the transcript but skipped automatic paste. Press Command+V to paste it.`
          : pasteResult?.copied
            ? completionMessage
            : `${completionMessage} Transcript is available in Dictivo, but could not be copied to the clipboard.`
      );
    } catch (error) {
      setDictationPhase("error");
      setStatusMessage(error instanceof Error ? error.message : "Local dictation failed.");
    }
  }, [dictionaryForLanguage, language, localProcessing, saveSession, selectedTier, snippetsForLanguage]);

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
    setHotkeyStatus("Registering hotkeys...");
    register(shortcuts, (event) => {
      const intent = resolveHotkeyIntent(event, hotkeys, isDictatingRef.current);
      if (intent === "start-dictation") void startDictationRef.current?.();
      if (intent === "stop-dictation") void stopDictationRef.current?.();
      if (intent === "paste-last") void pasteLastTranscriptRef.current?.();
    })
      .then(async () => {
        const unavailable = [];
        for (const shortcut of shortcuts) {
          if (!(await isRegistered(shortcut))) unavailable.push(shortcut);
        }

        if (disposed) return;
        if (unavailable.length > 0) {
          setHotkeyStatus("Hotkey unavailable");
          setStatusMessage(`Unable to reserve global hotkey: ${unavailable.join(", ")}`);
          return;
        }

        setHotkeyStatus(`${hotkeys.dictation} ready`);
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setHotkeyStatus("Hotkey unavailable");
          setStatusMessage(error instanceof Error ? error.message : "Unable to register global hotkeys.");
        }
      });

    return () => {
      disposed = true;
      void unregister(shortcuts).catch(() => undefined);
    };
  }, [hotkeys.activationMode, hotkeys.dictation, hotkeys.pasteLast]);

  const companionSnapshot = useMemo(
    () =>
      buildCompanionSnapshot({
        enabled: companionEnabled,
        avatar: companionAvatar,
        phase: dictationPhase,
        hotkey: hotkeys.dictation,
        liveText,
        statusMessage,
        pasteStatus,
        recordingStartedAt,
        language
      }),
    [companionAvatar, companionEnabled, dictationPhase, hotkeys.dictation, language, liveText, pasteStatus, recordingStartedAt, statusMessage]
  );

  const showCompanionWindow = useCallback(async () => {
    setCompanionEnabled(true);
    setStatusMessage("");

    if (!isTauriRuntime()) return;

    try {
      const companion = await TauriWindow.getByLabel("companion");
      if (!companion) {
        setStatusMessage("Floating companion window is unavailable.");
        return;
      }

      if (!companionPositionedRef.current) {
        await positionCompanionWindow(companion);
        companionPositionedRef.current = true;
      }

      await companion.show();
      await emitTo("companion", "companion-state", { ...companionSnapshot, enabled: true });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to show floating companion.");
    }
  }, [companionSnapshot]);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let unlisten: (() => void) | undefined;
    void listen("companion-hide-requested", () => {
      setCompanionEnabled(false);
      setStatusMessage("Floating companion hidden. Re-enable it in Settings -> Companion.");
    }).then((cleanup) => {
      unlisten = cleanup;
    });

    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    const syncCompanion = async () => {
      const companion = await TauriWindow.getByLabel("companion");
      if (!companion || disposed) return;

      if (!companionSnapshot.enabled) {
        await companion.hide();
        return;
      }

      if (!companionPositionedRef.current) {
        await positionCompanionWindow(companion);
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
  }, [companionSnapshot]);

  const addDictionaryTerm = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const normalized = trimmed.toLocaleLowerCase();
    setDictionary((current) => {
      if (current.some((item) => item.language === language && item.value.trim().toLocaleLowerCase() === normalized)) return current;
      return [
        { id: createId("term"), value: trimmed, language, createdAt: new Date().toISOString() },
        ...current
      ];
    });
  }, [language]);

  const addSnippet = useCallback((trigger: string, replacement: string) => {
    const trimmedTrigger = trigger.trim();
    const trimmedReplacement = replacement.trim();
    if (!trimmedTrigger || !trimmedReplacement) return;
    const normalizedTrigger = trimmedTrigger.toLocaleLowerCase();
    setSnippets((current) => {
      if (current.some((item) => item.language === language && item.trigger.trim().toLocaleLowerCase() === normalizedTrigger)) return current;
      return [
        {
          id: createId("snippet"),
          trigger: trimmedTrigger,
          replacement: trimmedReplacement,
          language,
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

        <SidebarMascot avatar={companionAvatar} onClick={() => void showCompanionWindow()} />
      </aside>

      <section className="workspace">
        <header className="topbar">
          {view === "dictation" ? (
            <div className="heading-block">
              <div className="title-row">
                <h1>Private Dictation.</h1>
                <span className="beta-chip">BETA</span>
              </div>
              <p className="promise">
                Audio, transcripts, dictionary, snippets — <b>everything stays on this device</b>. No cloud round-trip, no API keys, no account required.
              </p>
            </div>
          ) : (
            <div className="heading-block">
              <div className="title-row">
                <h1>{viewTitle(view)}</h1>
              </div>
            </div>
          )}
          <div className="toolbar">
            <label className="select-control">
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}
                aria-label="Dictation language"
              >
                {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        {statusMessage && (
          <div className="status-banner" aria-live="polite">
            {statusMessage}
          </div>
        )}

        {view === "dictation" && (
          <DictationWorkbench
            language={language}
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
            onTierChange={(tier) => void handleTierChange(tier)}
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
            hotkeys={hotkeys}
            localProcessing={localProcessing}
            permissions={permissions}
            privateFastStatus={privateFastStatus}
            privateFastModels={privateFastModels}
            privateFastOperation={privateFastOperation}
            companionEnabled={companionEnabled}
            companionAvatar={companionAvatar}
            hardwareProfile={hardwareProfile}
            runnableTiers={runnableTiers}
            onHotkeyChange={updateHotkey}
            onProcessingChange={updateProcessingSetting}
            onCompanionEnabledChange={setCompanionEnabled}
            onCompanionAvatarChange={setCompanionAvatar}
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

function SidebarMascot({ avatar, onClick }: { avatar: CompanionAvatar; onClick: () => void }) {
  return (
    <button type="button" className="sidebar-mascot" title="Show floating companion" aria-label="Show floating companion" onClick={onClick}>
      <MascotGlyph avatar={avatar} />
    </button>
  );
}

function MascotGlyph({ avatar }: { avatar: CompanionAvatar }) {
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
  if (avatar === "trump") return <img src={trumpAvatarImage} alt="" draggable={false} />;
  if (avatar === "bikini") return <img src={bikiniAvatarImage} alt="" draggable={false} />;
  if (avatar === "muscle") return <img src={muscleAvatarImage} alt="" draggable={false} />;
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

async function positionCompanionWindow(window: TauriWindow) {
  const [monitor, size] = await Promise.all([primaryMonitor(), window.outerSize()]);
  if (!monitor) return;

  const position = companionWindowPosition(monitor.workArea, size);
  await window.setPosition(new PhysicalPosition(position.x, position.y));
}
