import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocalSession } from "@dictivo/shared";
import { DictationWorkbench } from "../src/components/DictationWorkbench";
import { DictionaryView } from "../src/components/DictionaryView";
import { HistoryView } from "../src/components/HistoryView";
import { SettingsView } from "../src/components/SettingsView";
import type { HardwareProfile, PrivateFastModel, PrivateFastStatus, RunnableTiers } from "../src/lib/desktopBridge";

const status: PrivateFastStatus = {
  ready: false,
  modelId: "small",
  modelName: "Small",
  message: "Private Fast requires setup.",
  setupHint: "Download a model."
};

const installedStatus: PrivateFastStatus = {
  ...status,
  ready: true,
  message: "Local engine ready."
};

const hardware: HardwareProfile = {
  platform: "macos",
  arch: "arm64",
  cpuCores: 12,
  memoryTotalBytes: 32 * 1024 ** 3,
  accelerators: ["Metal"],
  performanceClass: "gpuHigh",
  recommendedModelId: "small",
  recommendedProfile: "quality",
  reason: "High-end local hardware can use a quality profile."
};

const models: PrivateFastModel[] = [
  {
    id: "small",
    label: "Small",
    useCase: "Default local dictation",
    speed: "Fast",
    quality: "Good",
    sizeLabel: "469 MB",
    notes: "Good first model.",
    installed: true,
    selected: true,
    path: "/models/small.bin"
  },
  {
    id: "large-v3",
    label: "Large v3",
    useCase: "Highest accuracy",
    speed: "Slow",
    quality: "Highest",
    sizeLabel: "3.1 GB",
    notes: "Use when quality matters.",
    installed: false,
    selected: false
  }
];

describe("desktop screen render contracts", () => {
  it("keeps dictation controls, live text, shortcuts, and engine telemetry visible", () => {
    const runnableTiers: RunnableTiers = {
      fast: { modelId: "small", realtimeFactor: 0.5, predicted: false, downloaded: true, withinBudget: true },
      medium: { modelId: "medium", realtimeFactor: 1.2, predicted: true, downloaded: false, withinBudget: true },
      slow: { modelId: "large-v3", realtimeFactor: 3.5, predicted: true, downloaded: false, withinBudget: false },
      fingerprint: "abc123",
      benchmarkedAt: "2026-05-12T00:00:00.000Z"
    };
    const markup = renderToStaticMarkup(
      <DictationWorkbench
        language="en"
        isDictating={false}
        liveText="A very long local transcript with punctuation & symbols <> stays editable."
        hotkeyStatus="CommandOrControl+Shift+Space ready"
        pasteStatus="Copied to clipboard"
        privateFastStatus={status}
        hardwareProfile={hardware}
        selectedModel={models[0]}
        runnableTiers={runnableTiers}
        selectedTier="fast"
        hotkeys={{ dictation: "Alt+Space", pasteLast: "Alt+Shift+V", activationMode: "hold" }}
        companionAvatar="dog"
        companionEnabled={false}
        onTierChange={vi.fn()}
        onToggleDictation={vi.fn()}
        onLiveTextChange={vi.fn()}
        onOpenHistory={vi.fn()}
      />
    );

    expect(markup).toContain("⌥Space");
    expect(markup).toContain("⌥⇧V");
    expect(markup).toContain("Hold and speak");
    expect(markup).toContain("Start dictation");
    expect(markup).toContain("CommandOrControl+Shift+Space ready");
    expect(markup).toContain("Copied to clipboard");
  });

  it("renders history empty state and dense session actions", () => {
    const emptyMarkup = renderToStaticMarkup(
      <HistoryView sessions={[]} query="!@#$" onQueryChange={vi.fn()} onClear={vi.fn()} onDeleteSession={vi.fn()} />
    );
    const session: LocalSession = {
      id: "session_1",
      title: "Message 10:30",
      mode: "message",
      language: "en",
      privacyMode: "local-only",
      provider: "local-whisper",
      createdAt: "2026-05-11T00:00:00.000Z",
      durationSeconds: 12,
      wordCount: 6,
      rawText: "raw text",
      text: "final text"
    };
    const filledMarkup = renderToStaticMarkup(
      <HistoryView sessions={[session]} query="" onQueryChange={vi.fn()} onClear={vi.fn()} onDeleteSession={vi.fn()} />
    );

    expect(emptyMarkup).toContain("No local dictations match this search.");
    expect(filledMarkup).toContain("Message 10:30");
    expect(filledMarkup).toContain("Copy raw transcript");
    expect(filledMarkup).toContain("Copy final text");
    expect(filledMarkup).toContain("Export markdown");
    expect(filledMarkup).toContain("Delete message");
  });

  it("renders dictionary and snippet empty states plus removal actions for populated data", () => {
    const emptyMarkup = renderToStaticMarkup(
      <DictionaryView dictionary={[]} snippets={[]} onAddTerm={vi.fn()} onAddSnippet={vi.fn()} onRemoveTerm={vi.fn()} onRemoveSnippet={vi.fn()} />
    );
    const filledMarkup = renderToStaticMarkup(
      <DictionaryView
        dictionary={[{ id: "term_1", value: "SupercalifragilisticDictivoTerm", language: "en", createdAt: "2026-05-11" }]}
        snippets={[
          {
            id: "snippet_1",
            trigger: "calendar",
            replacement: "https://cal.example/with/a/very/long/path?x=1&y=2",
            language: "en",
            createdAt: "2026-05-11"
          }
        ]}
        onAddTerm={vi.fn()}
        onAddSnippet={vi.fn()}
        onRemoveTerm={vi.fn()}
        onRemoveSnippet={vi.fn()}
      />
    );

    expect(emptyMarkup).toContain("No local dictionary terms yet.");
    expect(emptyMarkup).toContain("No local snippets yet.");
    expect(emptyMarkup).toContain("keeps product names and technical words spelled correctly.");
    expect(emptyMarkup).toContain("expands to");
    expect(filledMarkup).toContain("SupercalifragilisticDictivoTerm");
    expect(filledMarkup).toContain("Remove");
  });

  it("renders every settings subsection with its expected controls (4-section layout)", () => {
    const runnableTiers: RunnableTiers = {
      fast: { modelId: "small", realtimeFactor: 0.5, predicted: false, downloaded: true, withinBudget: true },
      medium: { modelId: "medium", realtimeFactor: 1.2, predicted: true, downloaded: false, withinBudget: true },
      slow: { modelId: "large-v3", realtimeFactor: 3.5, predicted: true, downloaded: false, withinBudget: false },
      fingerprint: "abc123",
      benchmarkedAt: "2026-05-12T00:00:00.000Z"
    };
    const sharedProps = {
      appVersion: "0.2.0",
      hotkeys: {
        dictation: "CommandOrControl+Shift+Space",
        pasteLast: "CommandOrControl+Shift+V",
        activationMode: "toggle" as const
      },
      localProcessing: {
        autoPolish: true,
        spokenPunctuation: true,
        fillerWords: true,
        smartCapitalization: true
      },
      permissions: {
        microphone: "granted",
        accessibility: "denied",
        pasteAutomation: "clipboard-only"
      },
      privateFastStatus: installedStatus,
      privateFastModels: models,
      privateFastOperation: "download:large-v3",
      runnableTiers,
      companionEnabled: true,
      companionAvatar: "cat" as const,
      hardwareProfile: hardware,
      onHotkeyChange: vi.fn(),
      onProcessingChange: vi.fn(),
      onCompanionEnabledChange: vi.fn(),
      onCompanionAvatarChange: vi.fn(),
      onModelAction: vi.fn(),
      onImportModel: vi.fn(),
      onRefreshNative: vi.fn(),
      selectedTier: "medium" as const,
      rerunStatus: "idle" as const,
      rerunError: "",
      onTierChange: vi.fn(),
      onRerunBenchmark: vi.fn(),
      onOpenWizard: vi.fn()
    };

    const engine = renderToStaticMarkup(<SettingsView {...sharedProps} initialSection="engine" />);
    const hotkeys = renderToStaticMarkup(<SettingsView {...sharedProps} initialSection="hotkeys" />);
    const companion = renderToStaticMarkup(<SettingsView {...sharedProps} initialSection="companion" />);
    const privacy = renderToStaticMarkup(<SettingsView {...sharedProps} initialSection="privacy" />);

    expect(engine).toContain("Local engine ready.");
    expect(engine).toContain("Selected");
    expect(engine).toContain("Downloading");
    expect(engine).toContain("Import");
    // Processing toggles are now collapsed under Engine → Advanced (details/summary)
    expect(engine).toContain("Auto polish");
    expect(engine).toContain("Smart capitalization");
    expect(hotkeys).toContain("Paste Last");
    expect(hotkeys).toContain("Dictation activation");
    expect(companion).toContain("Show floating companion");
    expect(companion).toContain("Cat");
    expect(privacy).toContain("Local-only by design");
    expect(privacy).toContain("v0.2.0");
    expect(privacy).toContain("Needs permission");
    expect(privacy).toContain("Copy only");
  });
});
