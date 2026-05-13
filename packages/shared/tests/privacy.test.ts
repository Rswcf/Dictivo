import { describe, expect, it } from "vitest";
import { estimateWordCount, findForbiddenContentFields, LANGUAGE_LABELS, PROVIDERS, SUPPORTED_LANGUAGES } from "../src/index";

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

  it("exposes only the local whisper provider", () => {
    expect(PROVIDERS).toEqual(["local-whisper"]);
  });

  it("keeps supported language labels aligned with the language list", () => {
    expect(Object.keys(LANGUAGE_LABELS).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
    expect(LANGUAGE_LABELS.zh).toBe("中文");
  });

  it("estimates English and CJK word counts with whitespace and empty input edges", () => {
    expect(estimateWordCount("", "en")).toBe(0);
    expect(estimateWordCount("  hello   local world  ", "en")).toBe(3);
    expect(estimateWordCount("本 地 优 先", "zh")).toBe(4);
    expect(estimateWordCount("ローカル 優先", "ja")).toBe(6);
  });
});
