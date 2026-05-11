import { describe, expect, it } from "vitest";
import { findForbiddenContentFields, PROVIDERS } from "../src/index";

describe("findForbiddenContentFields", () => {
  it("finds content fields recursively", () => {
    expect(
      findForbiddenContentFields({
        provider: "local-whisper",
        payload: {
          transcriptText: "private",
          safe: true
        },
        usage: [{ wordCount: 12 }]
      })
    ).toEqual(["payload.transcriptText"]);
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
});
