import type { DictionaryTerm, Snippet } from "@dictivo/shared";
import { BookOpenText, Bot, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { IconButton } from "./IconButton";

type DictionaryViewProps = {
  dictionary: DictionaryTerm[];
  snippets: Snippet[];
  onAddTerm: (value: string) => void;
  onAddSnippet: (trigger: string, replacement: string) => void;
  onRemoveTerm: (id: string) => void;
  onRemoveSnippet: (id: string) => void;
};

export function DictionaryView({ dictionary, snippets, onAddTerm, onAddSnippet, onRemoveTerm, onRemoveSnippet }: DictionaryViewProps) {
  const [term, setTerm] = useState("");
  const [trigger, setTrigger] = useState("");
  const [replacement, setReplacement] = useState("");
  const normalizedTerm = normalizeEntry(term);
  const normalizedTrigger = normalizeEntry(trigger);
  const termExists = normalizedTerm.length > 0 && dictionary.some((item) => normalizeEntry(item.value) === normalizedTerm);
  const snippetExists = normalizedTrigger.length > 0 && snippets.some((item) => normalizeEntry(item.trigger) === normalizedTrigger);
  const canAddTerm = normalizedTerm.length > 0 && !termExists;
  const canAddSnippet = normalizedTrigger.length > 0 && replacement.trim().length > 0 && !snippetExists;
  const termFeedback = termExists ? "Term already exists." : "";
  const snippetFeedback = snippetExists
    ? "Snippet trigger already exists."
    : (trigger.length > 0 || replacement.length > 0) && !canAddSnippet
      ? "Enter both trigger and replacement."
      : "";

  return (
    <section className="dictionary-grid">
      <div className="side-panel">
        <PanelTitle icon={<BookOpenText size={18} />} title="Local Dictionary" />
        <div className="inline-form">
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Supabase, 张伟, kubectl..."
            aria-label="Dictionary term"
          />
          <IconButton
            label="Add term"
            tone="primary"
            disabled={!canAddTerm}
            onClick={() => {
              if (!canAddTerm) return;
              onAddTerm(term);
              setTerm("");
            }}
          >
            <Plus size={18} />
          </IconButton>
        </div>
        {termFeedback && <p className="field-feedback" aria-live="polite">{termFeedback}</p>}
        <div className="field-example">
          <span>Example</span>
          <code>Dictivo</code>
          <small>keeps product names and technical words spelled correctly.</small>
        </div>
        <div className="token-list">
          {dictionary.length === 0 ? (
            <div className="empty-panel">No local dictionary terms yet.</div>
          ) : (
            dictionary.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onRemoveTerm(item.id)}
                title="Remove term"
                aria-label={`Remove dictionary term ${item.value}`}
              >
                {item.value}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="side-panel">
        <PanelTitle icon={<Bot size={18} />} title="Local Snippets" />
        <div className="snippet-form">
          <input value={trigger} onChange={(event) => setTrigger(event.target.value)} placeholder="my calendar link" aria-label="Snippet trigger" />
          <input value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder="https://..." aria-label="Snippet replacement" />
          <button
            type="button"
            className="text-button"
            disabled={!canAddSnippet}
            onClick={() => {
              if (!canAddSnippet) return;
              onAddSnippet(trigger, replacement);
              setTrigger("");
              setReplacement("");
            }}
          >
            <Plus size={16} />
            Add
          </button>
        </div>
        {snippetFeedback && <p className="field-feedback" aria-live="polite">{snippetFeedback}</p>}
        <div className="field-example field-example--snippet">
          <span>Example</span>
          <code>my calendar link</code>
          <small>expands to</small>
          <code>https://cal.com/example</code>
        </div>
        <div className="snippet-list">
          {snippets.length === 0 ? (
            <div className="empty-panel">No local snippets yet.</div>
          ) : (
            snippets.map((item) => (
              <div key={item.id}>
                <div className="snippet-head">
                  <strong>{item.trigger}</strong>
                  <button type="button" className="text-button" onClick={() => onRemoveSnippet(item.id)} aria-label={`Remove snippet ${item.trigger}`}>
                    <Trash2 size={16} />
                    Remove
                  </button>
                </div>
                <span>{item.replacement}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function normalizeEntry(value: string) {
  return value.trim().toLocaleLowerCase();
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}
