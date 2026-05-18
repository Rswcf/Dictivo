import { describe, expect, it } from "vitest";
import {
  detectTranscriptLanguage,
  estimateWordCount,
  findForbiddenContentFields,
  LANGUAGE_LABELS,
  PROVIDERS,
  SUPPORTED_LANGUAGES,
  TRANSCRIPTION_LANGUAGE_LABELS,
  TRANSCRIPTION_LANGUAGES
} from "../src/index";

describe("findForbiddenContentFields", () => {
  it("finds content fields recursively", () => {
    expect(
      findForbiddenContentFields({
        provider: "local-whisper",
        payload: {
          transcriptText: "private",
          transcript_text: "private snake case",
          content: "private alias",
          rawText: "private raw",
          raw_text: "private raw snake case",
          safe: true
        },
        usage: [{ wordCount: 12, prompt_terms: ["private term"] }]
      })
    ).toEqual([
      "payload.content",
      "payload.rawText",
      "payload.raw_text",
      "payload.transcriptText",
      "payload.transcript_text",
      "usage.0.prompt_terms"
    ]);
  });

  it("allows metadata-only payloads", () => {
    expect(
      findForbiddenContentFields({
        provider: "local-whisper",
        durationSeconds: 12,
        wordCount: 80,
        privacyMode: "local-only"
      })
    ).toEqual([]);
  });

  it("exposes local whisper and the single user-facing cloud provider", () => {
    expect(PROVIDERS).toEqual(["local-whisper", "cloud-fast"]);
  });

  it("keeps supported language labels aligned with the language list", () => {
    expect(Object.keys(LANGUAGE_LABELS).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
    expect(LANGUAGE_LABELS.zh).toBe("中文");
    expect(Object.keys(TRANSCRIPTION_LANGUAGE_LABELS).sort()).toEqual([...TRANSCRIPTION_LANGUAGES].sort());
    expect(TRANSCRIPTION_LANGUAGE_LABELS.auto).toBe("Auto-detect");
  });

  it("estimates English and CJK word counts with whitespace and empty input edges", () => {
    expect(estimateWordCount("", "en")).toBe(0);
    expect(estimateWordCount("  hello   local world  ", "en")).toBe(3);
    expect(estimateWordCount("本 地 优 先", "zh")).toBe(4);
    expect(estimateWordCount("ローカル 優先", "ja")).toBe(6);
    expect(estimateWordCount("本 地 优 先", "auto")).toBe(4);
  });

  it("detects obvious transcript languages for auto mode", () => {
    expect(detectTranscriptLanguage("你好世界")).toBe("zh");
    expect(detectTranscriptLanguage("ローカル優先")).toBe("ja");
    expect(detectTranscriptLanguage("Grüße aus Berlin")).toBe("de");
  });
});
