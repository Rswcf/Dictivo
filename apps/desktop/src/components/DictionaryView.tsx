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

  return (
    <section className="dictionary-grid">
      <div className="side-panel">
        <PanelTitle icon={<BookOpenText size={18} />} title="Local Dictionary" />
        <div className="inline-form">
          <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Supabase, 张伟, kubectl..." />
          <IconButton
            label="Add term"
            tone="primary"
            onClick={() => {
              onAddTerm(term);
              setTerm("");
            }}
          >
            <Plus size={18} />
          </IconButton>
        </div>
        <div className="token-list">
          {dictionary.length === 0 ? (
            <div className="empty-panel">No local dictionary terms yet.</div>
          ) : (
            dictionary.map((item) => (
              <button key={item.id} onClick={() => onRemoveTerm(item.id)} title="Remove term">
                {item.value}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="side-panel">
        <PanelTitle icon={<Bot size={18} />} title="Local Snippets" />
        <div className="snippet-form">
          <input value={trigger} onChange={(event) => setTrigger(event.target.value)} placeholder="my calendar link" />
          <input value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder="https://..." />
          <button
            className="text-button"
            onClick={() => {
              onAddSnippet(trigger, replacement);
              setTrigger("");
              setReplacement("");
            }}
          >
            <Plus size={16} />
            Add
          </button>
        </div>
        <div className="snippet-list">
          {snippets.length === 0 ? (
            <div className="empty-panel">No local snippets yet.</div>
          ) : (
            snippets.map((item) => (
              <div key={item.id}>
                <div className="snippet-head">
                  <strong>{item.trigger}</strong>
                  <button className="text-button" onClick={() => onRemoveSnippet(item.id)}>
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

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}
