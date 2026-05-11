import type { LocalSession } from "@dictivo/shared";

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

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
