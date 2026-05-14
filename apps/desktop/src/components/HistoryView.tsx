import type { LocalSession } from "@dictivo/shared";
import { useEffect, useState } from "react";
import { Check, ClipboardPaste, Download, FileText, Search, Trash2 } from "lucide-react";
import {
  downloadText,
  exportAllSessionsToMarkdown,
  historyExportFilename,
  markdownFilenameForSession,
  sessionToMarkdown
} from "../lib/export";
import { IconButton } from "./IconButton";

type HistoryViewProps = {
  sessions: LocalSession[];
  query: string;
  onQueryChange: (value: string) => void;
  onClear: () => void;
  onDeleteSession: (sessionId: string) => void;
  onCopyText: (session: LocalSession, kind: "raw" | "final") => void;
  onPasteSession: (session: LocalSession) => void;
  isClearing?: boolean;
  copyingSessionId?: string;
  deletingSessionId?: string;
  pastingSessionId?: string;
};

export function HistoryView({
  sessions,
  query,
  onQueryChange,
  onClear,
  onDeleteSession,
  onCopyText,
  onPasteSession,
  isClearing = false,
  copyingSessionId,
  deletingSessionId,
  pastingSessionId
}: HistoryViewProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const normalized = query.trim().toLowerCase();
  const filteredSessions = normalized
    ? sessions.filter((session) => `${session.title} ${session.mode} ${session.language} ${session.text}`.toLowerCase().includes(normalized))
    : sessions;
  useEffect(() => {
    if (sessions.length === 0) setConfirmingClear(false);
  }, [sessions.length]);

  const operationInProgress = isClearing || Boolean(copyingSessionId) || Boolean(deletingSessionId) || Boolean(pastingSessionId);

  return (
    <section className="history-view">
      <div className="search-row">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search local history"
          aria-label="Search local history"
        />
        <IconButton
          label="Export all history as Markdown"
          disabled={sessions.length === 0 || operationInProgress}
          onClick={() => downloadText(historyExportFilename(), exportAllSessionsToMarkdown(sessions))}
        >
          <Download size={18} />
        </IconButton>
        <IconButton label="Clear local history" tone="danger" disabled={sessions.length === 0 || operationInProgress} onClick={() => setConfirmingClear(true)}>
          <Trash2 size={18} />
        </IconButton>
      </div>

      {confirmingClear && (
        <div className="inline-confirm history-clear-confirm" role="group" aria-label="Confirm clear local history">
          <strong>Delete all local history?</strong>
          <p>This removes every saved local dictation from this device.</p>
          <div className="inline-confirm-actions">
            <button className="text-button" type="button" onClick={() => setConfirmingClear(false)}>
              Cancel
            </button>
            <button
              className="text-button primary"
              type="button"
              disabled={isClearing}
              onClick={() => {
                setConfirmingClear(false);
                onClear();
              }}
            >
              {isClearing ? "Deleting" : "Delete all"}
            </button>
          </div>
        </div>
      )}

      <div className="session-list">
        {filteredSessions.length === 0 ? (
          <div className="empty-panel">{normalized ? "No local dictations match this search." : "No local dictations yet."}</div>
        ) : (
          filteredSessions.map((session) => (
            <article className="session-item" key={session.id}>
              <div>
                <h2>{session.title}</h2>
                <p>{session.text}</p>
                <span>
                  {session.mode} · {session.language} · {session.wordCount} {countLabel(session.language)} · local-only
                  {session.rawText ? " · raw saved" : ""}
                </span>
              </div>
              <div className="item-actions">
                {session.rawText && (
                  <IconButton
                    label="Copy raw transcript"
                    disabled={operationInProgress || copyingSessionId === `${session.id}:raw`}
                    onClick={() => onCopyText(session, "raw")}
                  >
                    <FileText size={18} />
                  </IconButton>
                )}
                <IconButton
                  label="Copy final text"
                  disabled={operationInProgress || copyingSessionId === `${session.id}:final`}
                  onClick={() => onCopyText(session, "final")}
                >
                  <Check size={18} />
                </IconButton>
                <IconButton label="Export markdown" onClick={() => downloadText(markdownFilenameForSession(session), sessionToMarkdown(session))}>
                  <Download size={18} />
                </IconButton>
                <IconButton
                  label="Paste final text"
                  tone="primary"
                  disabled={operationInProgress}
                  onClick={() => onPasteSession(session)}
                >
                  <ClipboardPaste size={18} />
                </IconButton>
                <IconButton
                  label="Delete message"
                  tone="danger"
                  disabled={operationInProgress || deletingSessionId === session.id}
                  onClick={() => onDeleteSession(session.id)}
                >
                  <Trash2 size={18} />
                </IconButton>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function countLabel(language: LocalSession["language"]) {
  return language === "zh" || language === "ja" ? "characters" : "words";
}
