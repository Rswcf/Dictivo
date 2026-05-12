import type { LocalSession } from "@dictivo/shared";
import { useEffect, useState } from "react";
import { Check, Download, FileText, Search, Trash2 } from "lucide-react";
import { downloadText, sessionToMarkdown } from "../lib/export";
import { IconButton } from "./IconButton";

type HistoryViewProps = {
  sessions: LocalSession[];
  query: string;
  onQueryChange: (value: string) => void;
  onClear: () => void;
  onDeleteSession: (sessionId: string) => void;
  isClearing?: boolean;
  deletingSessionId?: string;
};

export function HistoryView({
  sessions,
  query,
  onQueryChange,
  onClear,
  onDeleteSession,
  isClearing = false,
  deletingSessionId
}: HistoryViewProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const normalized = query.trim().toLowerCase();
  const filteredSessions = normalized
    ? sessions.filter((session) => `${session.title} ${session.mode} ${session.language} ${session.text}`.toLowerCase().includes(normalized))
    : sessions;
  const isBusy = isClearing || Boolean(deletingSessionId);

  useEffect(() => {
    if (sessions.length === 0) setConfirmingClear(false);
  }, [sessions.length]);

  return (
    <section className="history-view">
      <div className="search-row">
        <Search size={18} />
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search local history" />
        <IconButton label="Clear local history" tone="danger" disabled={sessions.length === 0 || isBusy} onClick={() => setConfirmingClear(true)}>
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
          <div className="empty-panel">No local dictations match this search.</div>
        ) : (
          filteredSessions.map((session) => (
            <article className="session-item" key={session.id}>
              <div>
                <h2>{session.title}</h2>
                <p>{session.text}</p>
                <span>
                  {session.mode} · {session.language} · {session.wordCount} words · local-only
                  {session.rawText ? " · raw saved" : ""}
                </span>
              </div>
              <div className="item-actions">
                {session.rawText && (
                  <IconButton label="Copy raw transcript" onClick={() => void navigator.clipboard.writeText(session.rawText ?? "")}>
                    <FileText size={18} />
                  </IconButton>
                )}
                <IconButton label="Copy final text" onClick={() => void navigator.clipboard.writeText(session.text)}>
                  <Check size={18} />
                </IconButton>
                <IconButton label="Export markdown" onClick={() => downloadText(`${session.id}.md`, sessionToMarkdown(session))}>
                  <Download size={18} />
                </IconButton>
                <IconButton
                  label="Delete message"
                  tone="danger"
                  disabled={isClearing || deletingSessionId === session.id}
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
