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
