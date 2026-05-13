import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalSession } from "@dictivo/shared";
import { downloadText, markdownFilenameForSession, safeDownloadBasename, sessionToMarkdown } from "../src/lib/export";

const session: LocalSession = {
  id: "session_1",
  title: "Local Dictation",
  mode: "message",
  language: "en",
  privacyMode: "local-only",
  provider: "local-whisper",
  createdAt: "2026-05-11T12:00:00.000Z",
  durationSeconds: 12,
  wordCount: 5,
  rawText: "raw local transcript",
  text: "Final local transcript."
};

describe("history export helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serializes a local session as markdown without raw content leakage", () => {
    expect(sessionToMarkdown(session)).toBe(
      [
        "# Local Dictation",
        "",
        "- Created: 2026-05-11T12:00:00.000Z",
        "- Mode: message",
        "- Language: en",
        "- Privacy: local-only",
        "- Provider: local-whisper",
        "",
        "## Transcript",
        "",
        "Final local transcript."
      ].join("\n")
    );
  });

  it("uses a stable markdown filename for normal session ids", () => {
    expect(markdownFilenameForSession(session)).toBe("session_1.md");
  });

  it("sanitizes markdown filenames from legacy or corrupted session ids", () => {
    expect(markdownFilenameForSession({ ...session, id: " ../bad/session:01\n " })).toBe("bad-session-01.md");
    expect(markdownFilenameForSession({ ...session, id: "" })).toBe("dictivo-session.md");
    expect(markdownFilenameForSession({ ...session, id: "CON" })).toBe("CON-session.md");
  });

  it("keeps download basenames short and filesystem-safe", () => {
    const longId = `${"session-".repeat(20)}end`;

    expect(safeDownloadBasename("report<>:\"/\\|?*\u0000 final")).toBe("report-final");
    expect(safeDownloadBasename(longId).length).toBeLessThanOrEqual(80);
    expect(safeDownloadBasename(longId)).not.toMatch(/[.-]$/);
    expect(safeDownloadBasename("...")).toBe("dictivo-session");
  });

  it("downloads markdown through an object URL and revokes it", () => {
    const click = vi.fn();
    const createObjectURL = vi.fn(() => "blob:local-markdown");
    const revokeObjectURL = vi.fn();
    const anchor = {
      href: "",
      download: "",
      click
    };

    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor)
    });
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL
    });

    downloadText("session.md", "markdown text");

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchor.href).toBe("blob:local-markdown");
    expect(anchor.download).toBe("session.md");
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:local-markdown");
  });
});
