/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { LocalSession } from "@dictivo/shared";
import { DictionaryView } from "../src/components/DictionaryView";
import { DictationWorkbench } from "../src/components/DictationWorkbench";
import { HistoryView } from "../src/components/HistoryView";
import type { HardwareProfile, PrivateFastModel, PrivateFastStatus, RunnableTiers } from "../src/lib/desktopBridge";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sessions: LocalSession[] = [
  {
    id: "session_1",
    title: "First Message",
    mode: "message",
    language: "en",
    privacyMode: "local-only",
    provider: "local-whisper",
    createdAt: "2026-05-13T00:00:00.000Z",
    durationSeconds: 4,
    wordCount: 2,
    rawText: "raw first",
    text: "final first"
  },
  {
    id: "session_2",
    title: "Second Message",
    mode: "message",
    language: "de",
    privacyMode: "local-only",
    provider: "local-whisper",
    createdAt: "2026-05-13T00:01:00.000Z",
    durationSeconds: 5,
    wordCount: 3,
    text: "final second"
  }
];

const privateFastStatus: PrivateFastStatus = {
  ready: true,
  modelId: "small",
  modelName: "Small",
  message: "Local engine ready.",
  setupHint: ""
};

const hardwareProfile: HardwareProfile = {
  platform: "macos",
  arch: "arm64",
  cpuCores: 10,
  memoryTotalBytes: 16 * 1024 ** 3,
  accelerators: ["Metal"],
  performanceClass: "gpuHigh",
  recommendedModelId: "small",
  recommendedProfile: "quality",
  reason: "Apple Silicon GPU detected."
};

const selectedModel: PrivateFastModel = {
  id: "small",
  label: "Small",
  useCase: "Default local dictation",
  speed: "Fast",
  quality: "Good",
  sizeLabel: "469 MB",
  notes: "Good first model.",
  installed: true,
  selected: true
};

const runnableTiers: RunnableTiers = {
  fast: { modelId: "small", realtimeFactor: 0.5, predicted: false, downloaded: true, withinBudget: true },
  medium: { modelId: "small", realtimeFactor: 0.8, predicted: false, downloaded: true, withinBudget: true },
  slow: { modelId: "large-v3", realtimeFactor: 3.2, predicted: true, downloaded: false, withinBudget: false },
  fingerprint: "fp",
  benchmarkedAt: "2026-05-13T00:00:00.000Z"
};

const cloudFastEntitlement = {
  available: false,
  plan: "unknown",
  priceUsdMonthly: "6.99",
  monthlySecondsLimit: 90_000,
  monthlySecondsUsed: 0,
  renewsAt: null,
  upgradeUrl: "https://dictivo.app/cloud-fast",
  privacyNotice: "Cloud Fast uploads audio to cloud transcription providers for faster results."
};

describe("DictationWorkbench interactions", () => {
  it("edits text, changes tiers, opens history, toggles dictation, and hides the companion through React state", () => {
    const onTierChange = vi.fn();
    const onToggleDictation = vi.fn();
    const onLiveTextChange = vi.fn();
    const onOpenHistory = vi.fn();
    const onDisableCompanion = vi.fn();

    render(
      <DictationWorkbench
        language="en"
        transcriptionMode="local"
        cloudFastEntitlement={cloudFastEntitlement}
        isDictating={false}
        liveText=""
        hotkeyStatus="Registered"
        pasteStatus="Copied"
        privateFastStatus={privateFastStatus}
        hardwareProfile={hardwareProfile}
        selectedModel={selectedModel}
        runnableTiers={runnableTiers}
        selectedTier="medium"
        hotkeys={{ dictation: "CommandOrControl+Shift+Space", pasteLast: "CommandOrControl+Shift+V", activationMode: "toggle" }}
        companionAvatar="dog"
        companionEnabled
        customCompanionAvatar={null}
        onTranscriptionModeChange={vi.fn()}
        onTierChange={onTierChange}
        onUpgradeCloudFast={vi.fn()}
        onToggleDictation={onToggleDictation}
        onLiveTextChange={onLiveTextChange}
        onOpenHistory={onOpenHistory}
        onDisableCompanion={onDisableCompanion}
      />
    );

    expect(screen.getByLabelText("Floating companion preview")).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Quality" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));
    expect(onToggleDictation).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Live dictation text"), { target: { value: "Hello Dictivo" } });
    expect(onLiveTextChange).toHaveBeenCalledWith("Hello Dictivo");
    fireEvent.click(screen.getByRole("radio", { name: "Fast" }));
    expect(onTierChange).toHaveBeenCalledWith("fast");
    fireEvent.click(screen.getByRole("button", { name: "Resume from history" }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Hide preview" }));
    expect(onDisableCompanion).toHaveBeenCalledTimes(1);
  });
});

describe("HistoryView interactions", () => {
  it("searches, requests copy, deletes a single message, and confirms clear-all", () => {
    const onQueryChange = vi.fn();
    const onClear = vi.fn();
    const onDeleteSession = vi.fn();
    const onCopyText = vi.fn();
    const onPasteSession = vi.fn();

    render(
      <HistoryView
        sessions={sessions}
        query=""
        onQueryChange={onQueryChange}
        onClear={onClear}
        onDeleteSession={onDeleteSession}
        onCopyText={onCopyText}
        onPasteSession={onPasteSession}
      />
    );

    fireEvent.change(screen.getByLabelText("Search local history"), { target: { value: "second" } });
    expect(onQueryChange).toHaveBeenCalledWith("second");

    fireEvent.click(screen.getByRole("button", { name: "Copy raw transcript" }));
    expect(onCopyText).toHaveBeenCalledWith(sessions[0], "raw");
    fireEvent.click(screen.getAllByRole("button", { name: "Copy final text" })[1]!);
    expect(onCopyText).toHaveBeenCalledWith(sessions[1], "final");

    fireEvent.click(screen.getAllByRole("button", { name: "Delete message" })[0]!);
    expect(onDeleteSession).toHaveBeenCalledWith("session_1");
    fireEvent.click(screen.getAllByRole("button", { name: "Paste final text" })[0]!);
    expect(onPasteSession).toHaveBeenCalledWith(sessions[0]);

    fireEvent.click(screen.getByRole("button", { name: "Clear local history" }));
    expect(screen.getByRole("group", { name: "Confirm clear local history" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Confirm clear local history" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear local history" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group", { name: "Confirm clear local history" })).toBeNull();
  });

  it("disables destructive history actions while an operation is running", () => {
    render(
      <HistoryView
        sessions={sessions}
        query=""
        onQueryChange={vi.fn()}
        onClear={vi.fn()}
        onDeleteSession={vi.fn()}
        onCopyText={vi.fn()}
        onPasteSession={vi.fn()}
        deletingSessionId="session_2"
      />
    );

    expect(screen.getByRole("button", { name: "Clear local history" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Copy raw transcript" })).toHaveProperty("disabled", true);
    expect(screen.getAllByRole("button", { name: "Delete message" })[0]).toHaveProperty("disabled", true);
    expect(screen.getAllByRole("button", { name: "Delete message" })[1]).toHaveProperty("disabled", true);
    expect(screen.getAllByRole("button", { name: "Paste final text" })[0]).toHaveProperty("disabled", true);
  });

  it("locks delete controls while copy or paste history operations are running", () => {
    const baseProps = {
      sessions,
      query: "",
      onQueryChange: vi.fn(),
      onClear: vi.fn(),
      onDeleteSession: vi.fn(),
      onCopyText: vi.fn(),
      onPasteSession: vi.fn()
    };

    const { rerender } = render(
      <HistoryView
        {...baseProps}
        copyingSessionId="session_1:final"
      />
    );

    expect(screen.getAllByRole("button", { name: "Delete message" })[0]).toHaveProperty("disabled", true);
    expect(screen.getAllByRole("button", { name: "Delete message" })[1]).toHaveProperty("disabled", true);

    rerender(
      <HistoryView
        {...baseProps}
        pastingSessionId="session_2"
      />
    );

    expect(screen.getAllByRole("button", { name: "Delete message" })[0]).toHaveProperty("disabled", true);
    expect(screen.getAllByRole("button", { name: "Delete message" })[1]).toHaveProperty("disabled", true);
  });
});

describe("DictionaryView interactions", () => {
  it("adds and clears dictionary terms and snippets", () => {
    const onAddTerm = vi.fn();
    const onAddSnippet = vi.fn();

    render(
      <DictionaryView
        dictionary={[]}
        snippets={[]}
        onAddTerm={onAddTerm}
        onAddSnippet={onAddSnippet}
        onRemoveTerm={vi.fn()}
        onRemoveSnippet={vi.fn()}
      />
    );

    const termInput = screen.getByLabelText("Dictionary term");
    fireEvent.change(termInput, { target: { value: "Dictivo" } });
    fireEvent.click(screen.getByRole("button", { name: "Add term" }));
    expect(onAddTerm).toHaveBeenCalledWith("Dictivo");
    expect((termInput as HTMLInputElement).value).toBe("");

    const triggerInput = screen.getByLabelText("Snippet trigger");
    const replacementInput = screen.getByLabelText("Snippet replacement");
    fireEvent.change(triggerInput, { target: { value: "calendar" } });
    fireEvent.change(replacementInput, { target: { value: "https://cal.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAddSnippet).toHaveBeenCalledWith("calendar", "https://cal.example");
    expect((triggerInput as HTMLInputElement).value).toBe("");
    expect((replacementInput as HTMLInputElement).value).toBe("");
  });

  it("prevents empty and duplicate dictionary or snippet entries", () => {
    const onAddTerm = vi.fn();
    const onAddSnippet = vi.fn();

    render(
      <DictionaryView
        dictionary={[{ id: "term_1", value: "Dictivo", language: "en", createdAt: "2026-05-13" }]}
        snippets={[{ id: "snippet_1", trigger: "calendar", replacement: "https://cal.example", language: "en", createdAt: "2026-05-13" }]}
        onAddTerm={onAddTerm}
        onAddSnippet={onAddSnippet}
        onRemoveTerm={vi.fn()}
        onRemoveSnippet={vi.fn()}
      />
    );

    const addTerm = screen.getByRole("button", { name: "Add term" });
    expect(addTerm).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Dictionary term"), { target: { value: " dictivo " } });
    expect(screen.getByText("Term already exists.")).toBeTruthy();
    expect(addTerm).toHaveProperty("disabled", true);
    fireEvent.click(addTerm);
    expect(onAddTerm).not.toHaveBeenCalled();

    const addSnippet = screen.getByRole("button", { name: "Add" });
    fireEvent.change(screen.getByLabelText("Snippet trigger"), { target: { value: "new trigger" } });
    expect(screen.getByText("Enter both trigger and replacement.")).toBeTruthy();
    expect(addSnippet).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Snippet trigger"), { target: { value: " Calendar " } });
    fireEvent.change(screen.getByLabelText("Snippet replacement"), { target: { value: "https://new.example" } });
    expect(screen.getByText("Snippet trigger already exists.")).toBeTruthy();
    expect(addSnippet).toHaveProperty("disabled", true);
    fireEvent.click(addSnippet);
    expect(onAddSnippet).not.toHaveBeenCalled();
  });

  it("removes existing dictionary terms and snippets", () => {
    const onRemoveTerm = vi.fn();
    const onRemoveSnippet = vi.fn();

    render(
      <DictionaryView
        dictionary={[{ id: "term_1", value: "whisper.cpp", language: "en", createdAt: "2026-05-13" }]}
        snippets={[{ id: "snippet_1", trigger: "calendar", replacement: "https://cal.example", language: "en", createdAt: "2026-05-13" }]}
        onAddTerm={vi.fn()}
        onAddSnippet={vi.fn()}
        onRemoveTerm={onRemoveTerm}
        onRemoveSnippet={onRemoveSnippet}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove dictionary term whisper.cpp" }));
    expect(onRemoveTerm).toHaveBeenCalledWith("term_1");
    fireEvent.click(screen.getByRole("button", { name: "Remove snippet calendar" }));
    expect(onRemoveSnippet).toHaveBeenCalledWith("snippet_1");
  });
});
