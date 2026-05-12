import { describe, expect, it } from "vitest";
import { polishLocalTranscript } from "../src/lib/localPolish";
import { DEFAULT_LOCAL_PROCESSING } from "../src/lib/settingsStore";

const baseOptions = {
  language: "en" as const,
  mode: "message" as const,
  targetApp: "Notes",
  dictionary: ["Dictivo"],
  snippets: [{ trigger: "my calendar link", replacement: "https://cal.example/dictivo" }],
  processing: DEFAULT_LOCAL_PROCESSING
};

describe("local transcript polishing", () => {
  it("polishes spoken punctuation, fillers, capitalization, and dictionary terms", () => {
    const result = polishLocalTranscript("um dictivo should remove fillers comma then capitalize", baseOptions);

    expect(result).toBe("Dictivo should remove fillers, then capitalize.");
  });

  it("keeps snippet replacements intact after punctuation normalization", () => {
    const result = polishLocalTranscript("send my calendar link comma please", baseOptions);

    expect(result).toBe("Send https://cal.example/dictivo, please.");
  });

  it("keeps raw mode close to the original while still expanding local snippets", () => {
    const result = polishLocalTranscript(" my calendar link needs no polish ", {
      ...baseOptions,
      mode: "raw"
    });

    expect(result).toBe("https://cal.example/dictivo needs no polish");
  });

  it("formats prompt mode with task scaffolding", () => {
    const result = polishLocalTranscript("draft a release note", {
      ...baseOptions,
      mode: "prompt"
    });

    expect(result).toBe("Goal:\nDraft a release note.\n\nContext:\n-\n\nRequirements:\n-\n\nOutput:");
  });

  it("formats email subject lines and paragraphs without collapsing intentional paragraph breaks", () => {
    const result = polishLocalTranscript("subject launch update new paragraph hello team new paragraph please review this", {
      ...baseOptions,
      mode: "email"
    });

    expect(result).toBe("Subject: Launch update\n\nHello team\n\nPlease review this.");
  });

  it("respects disabled auto-polish while still applying snippets", () => {
    const result = polishLocalTranscript("um my calendar link comma keep rough", {
      ...baseOptions,
      processing: {
        ...DEFAULT_LOCAL_PROCESSING,
        autoPolish: false
      }
    });

    expect(result).toBe("um https://cal.example/dictivo comma keep rough");
  });

  it("handles CJK punctuation and word-count style text without adding spaces", () => {
    const result = polishLocalTranscript("嗯 Dictivo 逗号 本地优先", {
      ...baseOptions,
      language: "zh",
      dictionary: ["Dictivo"],
      snippets: []
    });

    expect(result).toBe("Dictivo，本地优先。");
  });

  it("handles Japanese punctuation, fillers, and already-finished punctuation", () => {
    const result = polishLocalTranscript("えっと テスト 読点 完了 句点", {
      ...baseOptions,
      language: "ja",
      dictionary: [],
      snippets: []
    });

    expect(result).toBe("テスト、完了。");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(polishLocalTranscript("   ", baseOptions)).toBe("");
  });
});
