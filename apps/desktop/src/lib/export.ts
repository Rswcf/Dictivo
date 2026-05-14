import type { LocalSession } from "@dictivo/shared";

const DEFAULT_SESSION_BASENAME = "dictivo-session";
const RESERVED_WINDOWS_BASENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sessionToMarkdown(session: LocalSession) {
  const lines = [
    `# ${session.title}`,
    "",
    `- Created: ${session.createdAt}`,
    `- Mode: ${session.mode}`,
    `- Language: ${session.language}`,
    `- Privacy: ${session.privacyMode}`,
    `- Provider: ${session.provider}`,
    "",
    "## Transcript",
    "",
    session.text
  ];

  return lines.join("\n");
}

export function markdownFilenameForSession(session: LocalSession) {
  const safeId = safeDownloadBasename(session.id, DEFAULT_SESSION_BASENAME);
  return `${safeId}.md`;
}

export function safeDownloadBasename(value: string, fallback = DEFAULT_SESSION_BASENAME) {
  const safeFallback = sanitizeBasenameCandidate(fallback) || DEFAULT_SESSION_BASENAME;
  const basename = sanitizeBasenameCandidate(value) || safeFallback;
  return RESERVED_WINDOWS_BASENAME.test(basename) ? `${basename}-session` : basename;
}

function sanitizeBasenameCandidate(value: string) {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+/, "")
    .replace(/[.-]+$/g, "")
    .slice(0, 80)
    .replace(/[.-]+$/g, "");
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Bundle every session into a single Markdown document. Used by the
 * "Export all" affordance in the history view so a user can take their
 * full transcript log off the device in one click — the GDPR / data-
 * portability story that privacy-conscious buyers expect to see before
 * paying.
 *
 * Sessions are emitted newest-first, separated by horizontal rules.
 */
export function exportAllSessionsToMarkdown(
  sessions: LocalSession[],
  now: Date = new Date()
): string {
  const header = [
    "# Dictivo history export",
    "",
    `- Exported: ${now.toISOString()}`,
    `- Sessions: ${sessions.length}`,
    "",
    "All audio, transcripts, and metadata stayed on this device. This file is",
    "the only outbound copy and was produced by the user clicking Export.",
    "",
    "---",
    ""
  ];

  if (sessions.length === 0) {
    return [...header, "_No sessions to export._", ""].join("\n");
  }

  const body = sessions
    .map((session) => sessionToMarkdown(session))
    .join("\n\n---\n\n");

  return `${header.join("\n")}${body}\n`;
}

/**
 * Filename for the bundled export. Example: `dictivo-history-2026-05-14.md`.
 * Always ISO date (YYYY-MM-DD) so the filename sorts lexicographically.
 */
export function historyExportFilename(now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `dictivo-history-${date}.md`;
}
