import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { PhysicalPosition, Window as TauriWindow, primaryMonitor } from "@tauri-apps/api/window";
import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { BookOpenText, History, Languages, Mic2, Settings, TerminalSquare } from "lucide-react";
import {
  LANGUAGE_LABELS,
  type DictionaryTerm,
  type InputMode,
  type LocalSession,
  type ProcessingMode,
  type Snippet,
  type SupportedLanguage
} from "@dictivo/shared";
import { createId } from "./lib/id";
import { startAudioRecording, type RecordingController } from "./lib/mediaCapture";
import { runLocalDictation } from "./lib/localDictationEngine";
import {
  clearLocalSessions,
  getClipboardMarker,
  getHardwareProfile,
  getPrivateFastModels,
  getPrivateFastStatus,
  importPrivateFastModel,
  isTauriRuntime,
  listLocalSessions,
  pasteText,
  requestNativePermissions,
  saveLocalSession,
  selectPrivateFastModel,
  deletePrivateFastModel,
  downloadPrivateFastModel,
  type HardwareProfile,
  type PrivateFastModel,
  type PrivateFastStatus
} from "./lib/desktopBridge";
import {
  DEFAULT_HOTKEYS,
  DEFAULT_LOCAL_PROCESSING,
  loadSettings,
  normalizeHotkeys,
  normalizeLocalProcessing,
  saveSettings,
  type HotkeySettings,
  type LocalProcessingSettings,
  type ModelSelectionMode,
  type PrivateFastProfile,
  type CompanionAvatar
} from "./lib/settingsStore";
import { buildCompanionSnapshot, type CompanionPhase } from "./lib/companion";
import { DictationWorkbench } from "./components/DictationWorkbench";
import { CompanionWindow } from "./components/CompanionWindow";
import { HistoryView } from "./components/HistoryView";
import { DictionaryView } from "./components/DictionaryView";
import { SettingsView } from "./components/SettingsView";
import { resolveHotkeyIntent, uniqueShortcuts } from "./lib/hotkeys";

type View = "dictation" | "history" | "dictionary" | "settings";

type AppProps = {
  windowLabel?: string;
};

const modeTemplates: ProcessingMode[] = [
  {
    id: "message",
    label: "Message",
    inputMode: "message",
    language: "en",
    localOnly: true,
    instruction: "Turn speech into a concise message while preserving your natural tone."
  },
  {
    id: "email",
    label: "Email",
    inputMode: "email",
    language: "en",
    localOnly: true,
    instruction: "Format the dictation as a polished email using only local text processing."
  },
  {
    id: "raw",
    label: "Raw",
    inputMode: "raw",
    language: "en",
    localOnly: true,
    instruction: "Keep the transcript as close to the local model output as possible."
  },
  {
    id: "prompt",
    label: "Prompt",
    inputMode: "prompt",
    language: "en",
    localOnly: true,
    instruction: "Structure the dictation as an AI prompt with context and task sections."
  }
];

const sampleTerms: DictionaryTerm[] = [
  { id: "term_1", value: "Dictivo", language: "en", createdAt: new Date().toISOString() },
  { id: "term_2", value: "whisper.cpp", language: "en", createdAt: new Date().toISOString() },
  { id: "term_3", value: "本地优先", language: "zh", createdAt: new Date().toISOString() }
];

const sampleSnippets: Snippet[] = [
  {
    id: "snippet_1",
    trigger: "my calendar link",
    replacement: "https://cal.com/example",
    language: "en",
    createdAt: new Date().toISOString()
  }
];

export function App({ windowLabel = "main" }: AppProps) {
  if (windowLabel === "companion") return <CompanionWindow />;

  const [view, setView] = useState<View>("dictation");
  const [language, setLanguage] = useState<SupportedLanguage>("en");
  const [selectedMode, setSelectedMode] = useState<InputMode>("message");
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [liveText, setLiveText] = useState("");
  const [rawText, setRawText] = useState("");
  const [isDictating, setIsDictating] = useState(false);
  const [dictionary, setDictionary] = useState<DictionaryTerm[]>(sampleTerms);
  const [snippets, setSnippets] = useState<Snippet[]>(sampleSnippets);
  const [query, setQuery] = useState("");
  const [permissions, setPermissions] = useState<Record<string, string>>({});
  const [privateFastProfile, setPrivateFastProfile] = useState<PrivateFastProfile>("balanced");
  const [modelSelectionMode, setModelSelectionMode] = useState<ModelSelectionMode>("auto");
  const [companionEnabled, setCompanionEnabled] = useState(true);
  const [companionAvatar, setCompanionAvatar] = useState<CompanionAvatar>("dog");
  const [hotkeys, setHotkeys] = useState<HotkeySettings>(DEFAULT_HOTKEYS);
  const [localProcessing, setLocalProcessing] = useState<LocalProcessingSettings>(DEFAULT_LOCAL_PROCESSING);
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
  const [statusMessage, setStatusMessage] = useState("");
  const [hotkeyStatus, setHotkeyStatus] = useState("Not registered");
  const [pasteStatus, setPasteStatus] = useState("");
  const [dictationPhase, setDictationPhase] = useState<CompanionPhase>("idle");
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | undefined>();

  const dictationRecordingRef = useRef<RecordingController | null>(null);
  const isDictatingRef = useRef(false);
  const companionPositionedRef = useRef(false);
  const lastFinalTextRef = useRef("");
  const startDictationRef = useRef<(() => Promise<void>) | null>(null);
  const stopDictationRef = useRef<(() => Promise<void>) | null>(null);
  const pasteLastTranscriptRef = useRef<(() => Promise<void>) | null>(null);

  const selectedModel = useMemo(
    () => privateFastModels.find((model) => model.selected) ?? privateFastModels.find((model) => model.id === privateFastStatus.modelId),
    [privateFastModels, privateFastStatus.modelId]
  );

  const refreshNativeState = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    const settings = loadSettings();
    if (settings.language) setLanguage(settings.language);
    if (settings.selectedMode) setSelectedMode(settings.selectedMode);
    if (settings.dictionary) setDictionary(settings.dictionary);
    if (settings.snippets) setSnippets(settings.snippets);
    if (settings.privateFastProfile) setPrivateFastProfile(settings.privateFastProfile);
    if (settings.modelSelectionMode) setModelSelectionMode(settings.modelSelectionMode);
    if (typeof settings.companionEnabled === "boolean") setCompanionEnabled(settings.companionEnabled);
    if (settings.companionAvatar) setCompanionAvatar(settings.companionAvatar);
    setHotkeys(normalizeHotkeys(settings.hotkeys));
    setLocalProcessing(normalizeLocalProcessing(settings.localProcessing));

    void listLocalSessions().then((items) => {
      setSessions(items);
      lastFinalTextRef.current = items[0]?.text ?? "";
    });
    void refreshNativeState();
  }, [refreshNativeState]);

  useEffect(() => {
    localStorage.removeItem("dictivo-settings-v2");
    saveSettings({
      language,
      selectedMode,
      privateFastProfile,
      modelSelectionMode,
      companionEnabled,
      companionAvatar,
      hotkeys,
      localProcessing,
      dictionary,
      snippets
    });
  }, [companionAvatar, companionEnabled, dictionary, hotkeys, language, localProcessing, modelSelectionMode, privateFastProfile, selectedMode, snippets]);

  useEffect(() => {
    if (modelSelectionMode !== "auto" || !hardwareProfile || privateFastOperation) return;
    setPrivateFastProfile(hardwareProfile.recommendedProfile);
    const recommended = privateFastModels.find((model) => model.id === hardwareProfile.recommendedModelId);
    if (!recommended?.installed || recommended.selected) return;

    void selectPrivateFastModel(recommended.id)
      .then((status) => {
        setPrivateFastStatus(status);
        return getPrivateFastModels();
      })
      .then(setPrivateFastModels)
      .catch(() => {
        // Auto-selection is best-effort; the user can still select a model manually.
      });
  }, [hardwareProfile, modelSelectionMode, privateFastModels, privateFastOperation]);

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
    if (!privateFastStatus.ready) {
      setStatusMessage(`${privateFastStatus.message} ${privateFastStatus.setupHint}`);
      setDictationPhase("blocked");
      setView("settings");
      return;
    }

    setIsDictating(true);
    setDictationPhase("recording");
    setRecordingStartedAt(Date.now());
    setRawText("");
    setLiveText("Recording locally. Stop to transcribe with the on-device engine.");
    setStatusMessage("");
    setPasteStatus("");

    try {
      dictationRecordingRef.current = await startAudioRecording("microphone", "wav");
    } catch (error) {
      setIsDictating(false);
      setDictationPhase("error");
      setRecordingStartedAt(undefined);
      setStatusMessage(error instanceof Error ? error.message : "Unable to start microphone recording.");
    }
  }, [privateFastStatus.message, privateFastStatus.ready, privateFastStatus.setupHint]);

  const stopDictation = useCallback(async () => {
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
      const dictionaryValues = dictionary.map((term) => term.value);
      const snippetValues = snippets.map(({ trigger, replacement }) => ({ trigger, replacement }));
      const result = await runLocalDictation(audio, {
        language,
        dictionary: dictionaryValues,
        snippets: snippetValues,
        mode: selectedMode,
        profile: privateFastProfile,
        localProcessing
      });

      const pasteResult = await pasteText(result.finalizedText, clipboardBeforeTranscription);
      const wordCount = countWords(result.finalizedText, language);
      await saveSession({
        title: `${modeLabel(selectedMode)} ${new Date().toLocaleTimeString()}`,
        mode: selectedMode,
        language,
        privacyMode: "local-only",
        provider: "local-whisper",
        durationSeconds,
        wordCount,
        rawText: result.rawText,
        text: result.finalizedText
      });

      setRawText(result.rawText);
      setLiveText(result.finalizedText);
      setDictationPhase("complete");
      setPasteStatus(
        pasteResult.copied
          ? pasteResult.pasted
            ? "Pasted into active app"
            : "Copied to clipboard"
          : "Clipboard changed; transcript kept"
      );
      const completionMessage =
        result.fallbackUsed
          ? `Local transcription completed with fast fallback after ${privateFastProfile} profile failed.`
          : result.slowWarning
            ? result.slowWarning
            : `Local transcription completed with ${result.profileUsed} profile.`;
      setStatusMessage(
        pasteResult.copied
          ? completionMessage
          : `${completionMessage} Clipboard changed after recording, so Dictivo did not overwrite it.`
      );
    } catch (error) {
      setDictationPhase("error");
      setStatusMessage(error instanceof Error ? error.message : "Local dictation failed.");
    }
  }, [dictionary, language, localProcessing, privateFastProfile, saveSession, selectedMode, snippets]);

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

    const result = await pasteText(text);
    setDictationPhase("complete");
    setPasteStatus(result.pasted ? "Pasted last transcript" : "Copied last transcript");
    setStatusMessage("Last local transcript is ready in the target app or clipboard.");
  }, [liveText, sessions]);

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
    setDictionary((current) => [
      { id: createId("term"), value: trimmed, language, createdAt: new Date().toISOString() },
      ...current
    ]);
  }, [language]);

  const addSnippet = useCallback((trigger: string, replacement: string) => {
    if (!trigger.trim() || !replacement.trim()) return;
    setSnippets((current) => [
      {
        id: createId("snippet"),
        trigger: trigger.trim(),
        replacement: replacement.trim(),
        language,
        createdAt: new Date().toISOString()
      },
      ...current
    ]);
  }, [language]);

  const runPrivateFastModelAction = useCallback(
    async (action: "select" | "download" | "delete", modelId: string) => {
      if (action === "delete" && !window.confirm(`Delete local model ${modelId}? You can download or import it again later.`)) return;
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
        setModelSelectionMode(action === "select" ? "manual" : modelSelectionMode);
        setStatusMessage(action === "delete" ? "Local model deleted." : action === "download" ? "Local model downloaded and selected." : "Local model selected.");
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Local model operation failed.");
      } finally {
        setPrivateFastOperation("");
      }
    },
    [modelSelectionMode]
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
      setModelSelectionMode("manual");
      setStatusMessage("Local model imported and selected.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Local model import failed.");
    } finally {
      setPrivateFastOperation("");
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

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <div className="brand-block">
          <div className="brand-mark">
            <Mic2 size={22} />
          </div>
          <div>
            <strong>Dictivo</strong>
            <span>Local AI dictation</span>
          </div>
        </div>

        <nav className="nav-list">
          <NavButton active={view === "dictation"} label="Dictation" icon={<TerminalSquare size={18} />} onClick={() => setView("dictation")} />
          <NavButton active={view === "history"} label="History" icon={<History size={18} />} onClick={() => setView("history")} />
          <NavButton active={view === "dictionary"} label="Dictionary" icon={<BookOpenText size={18} />} onClick={() => setView("dictionary")} />
          <NavButton active={view === "settings"} label="Settings" icon={<Settings size={18} />} onClick={() => setView("settings")} />
        </nav>

        <div className="privacy-chip">
          <span className="status-dot" />
          <span>Local-only</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{view}</p>
            <h1>{viewTitle(view)}</h1>
          </div>
          <div className="toolbar">
            <label className="select-control">
              <Languages size={16} />
              <select value={language} onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}>
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
            selectedMode={selectedMode}
            modeTemplates={modeTemplates}
            isDictating={isDictating}
            liveText={liveText}
            rawText={rawText}
            hotkeyStatus={hotkeyStatus}
            pasteStatus={pasteStatus}
            privateFastStatus={privateFastStatus}
            hardwareProfile={hardwareProfile}
            selectedModel={selectedModel}
            privateFastProfile={privateFastProfile}
            onModeChange={setSelectedMode}
            onToggleDictation={toggleDictation}
            onLiveTextChange={setLiveText}
            onCopyRaw={() => void navigator.clipboard.writeText(rawText)}
          />
        )}

        {view === "history" && (
          <HistoryView
            sessions={sessions}
            query={query}
            onQueryChange={setQuery}
            onClear={() => {
              if (window.confirm("Delete all local dictation history? This cannot be undone.")) {
                void clearLocalSessions().then(() => setSessions([]));
              }
            }}
          />
        )}

        {view === "dictionary" && (
          <DictionaryView
            dictionary={dictionary}
            snippets={snippets}
            onAddTerm={addDictionaryTerm}
            onAddSnippet={addSnippet}
            onRemoveTerm={(id) => setDictionary((current) => current.filter((item) => item.id !== id))}
            onRemoveSnippet={(id) => setSnippets((current) => current.filter((item) => item.id !== id))}
          />
        )}

        {view === "settings" && (
          <SettingsView
            hotkeys={hotkeys}
            localProcessing={localProcessing}
            permissions={permissions}
            privateFastStatus={privateFastStatus}
            privateFastModels={privateFastModels}
            privateFastOperation={privateFastOperation}
            privateFastProfile={privateFastProfile}
            modelSelectionMode={modelSelectionMode}
            companionEnabled={companionEnabled}
            companionAvatar={companionAvatar}
            hardwareProfile={hardwareProfile}
            onHotkeyChange={updateHotkey}
            onProcessingChange={updateProcessingSetting}
            onProfileChange={setPrivateFastProfile}
            onSelectionModeChange={setModelSelectionMode}
            onCompanionEnabledChange={setCompanionEnabled}
            onCompanionAvatarChange={setCompanionAvatar}
            onModelAction={(action, modelId) => void runPrivateFastModelAction(action, modelId)}
            onImportModel={(modelId, sourcePath) => void runImportModel(modelId, sourcePath)}
            onRefreshNative={() => void refreshNativeState()}
          />
        )}
      </section>
    </main>
  );
}

function NavButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button className={`nav-button ${active ? "is-active" : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function viewTitle(view: View) {
  if (view === "history") return "Local History";
  if (view === "dictionary") return "Dictionary & Snippets";
  if (view === "settings") return "Local Engine Settings";
  return "Dictation Workbench";
}

function modeLabel(mode: InputMode) {
  return modeTemplates.find((template) => template.inputMode === mode)?.label ?? "Dictation";
}

function countWords(text: string, language: SupportedLanguage) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  if (language === "zh" || language === "ja") return [...trimmed.replace(/\s+/g, "")].length;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

async function positionCompanionWindow(window: TauriWindow) {
  const [monitor, size] = await Promise.all([primaryMonitor(), window.outerSize()]);
  if (!monitor) return;

  const workArea = monitor.workArea;
  const margin = 24;
  const x = workArea.position.x + workArea.size.width - size.width - margin;
  const y = workArea.position.y + margin;
  await window.setPosition(new PhysicalPosition(Math.max(workArea.position.x, x), Math.max(workArea.position.y, y)));
}
