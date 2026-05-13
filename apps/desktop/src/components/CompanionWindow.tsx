import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import trumpAvatarImage from "../assets/avatars/trump-companion.png";
import bikiniAvatarImage from "../assets/avatars/bikini-companion.png";
import muscleAvatarImage from "../assets/avatars/muscle-companion.png";
import { DEFAULT_HOTKEYS, type CompanionAvatar } from "../lib/settingsStore";
import { buildCompanionSnapshot, type CompanionPhase, type CompanionSnapshot } from "../lib/companion";
import { formatShortcutForDisplay } from "../lib/hotkeys";

const defaultSnapshot: CompanionSnapshot = buildCompanionSnapshot({
  enabled: true,
  avatar: "dog",
  phase: "idle",
  hotkey: formatShortcutForDisplay(DEFAULT_HOTKEYS.dictation),
  liveText: "",
  statusMessage: "",
  pasteStatus: "",
  language: "en"
});

export function CompanionWindow() {
  const [snapshot, setSnapshot] = useState<CompanionSnapshot>(defaultSnapshot);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listen<CompanionSnapshot>("companion-state", (event) => setSnapshot(event.payload)).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }
      unlisten = cleanup;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (snapshot.phase !== "recording") return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [snapshot.phase]);

  const elapsed = useMemo(() => {
    if (!snapshot.recordingStartedAt) return "00:00";
    return formatElapsed(Math.max(0, Math.floor((now - snapshot.recordingStartedAt) / 1000)));
  }, [now, snapshot.recordingStartedAt]);

  const startDragging = () => {
    void getCurrentWindow().startDragging().catch(() => undefined);
  };

  const hideCompanion = () => {
    void emitTo("main", "companion-hide-requested", {});
    void getCurrentWindow().hide().catch(() => undefined);
  };

  const emoteFor = (phase: CompanionPhase) => {
    if (phase === "recording") return <div className="companion-emote companion-emote--rec">●</div>;
    if (phase === "processing") return <div className="companion-emote companion-emote--proc">…</div>;
    if (phase === "complete") return <div className="companion-emote companion-emote--done">✓</div>;
    if (phase === "error" || phase === "blocked") return <div className="companion-emote companion-emote--err">!</div>;
    return null;
  };

  return (
    <section
      className={`companion-shell companion-shell--${snapshot.phase}`}
      onPointerDown={startDragging}
      aria-label="Dictivo floating recording status"
    >
      <div className="companion-avatar-wrap">
        <CartoonAvatar
          avatar={snapshot.avatar}
          customAvatarDataUrl={snapshot.customAvatarDataUrl}
          customAvatarName={snapshot.customAvatarName}
          phase={snapshot.phase}
        />
        {emoteFor(snapshot.phase)}
      </div>

      <div className="companion-bubble">
        <button
          className="companion-hide-button"
          type="button"
          title="Hide companion"
          aria-label="Hide companion"
          onClick={hideCompanion}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <X size={11} />
        </button>

        <div className="companion-title">{snapshot.title}</div>
        {snapshot.phase === "recording" ? (
          <div className="companion-timer">{elapsed}</div>
        ) : null}
        <div className="companion-sub">{snapshot.detail || snapshot.summary}</div>
      </div>
    </section>
  );
}

function CartoonAvatar({
  avatar,
  customAvatarDataUrl,
  customAvatarName,
  phase
}: {
  avatar: CompanionAvatar;
  customAvatarDataUrl?: string;
  customAvatarName?: string;
  phase: CompanionPhase;
}) {
  if (avatar === "custom" && customAvatarDataUrl) {
    return (
      <img
        className={`companion-avatar companion-avatar--custom is-${phase}`}
        src={customAvatarDataUrl}
        alt={customAvatarName ? `Custom companion avatar: ${customAvatarName}` : "Custom companion avatar"}
        draggable={false}
      />
    );
  }
  if (avatar === "cat") return <CatAvatar phase={phase} />;
  if (avatar === "trump") {
    return (
      <img
        className={`companion-avatar companion-avatar--trump is-${phase}`}
        src={trumpAvatarImage}
        alt="Cartoon Trump"
        draggable={false}
      />
    );
  }
  if (avatar === "bikini") {
    return (
      <img
        className={`companion-avatar companion-avatar--bikini is-${phase}`}
        src={bikiniAvatarImage}
        alt="Bikini companion"
        draggable={false}
      />
    );
  }
  if (avatar === "muscle") {
    return (
      <img
        className={`companion-avatar companion-avatar--muscle is-${phase}`}
        src={muscleAvatarImage}
        alt="Muscle companion"
        draggable={false}
      />
    );
  }
  return <DogAvatar phase={phase} />;
}

function DogAvatar({ phase }: { phase: CompanionPhase }) {
  return (
    <svg className={`companion-avatar companion-avatar--dog is-${phase}`} viewBox="0 0 96 96" role="img" aria-label="Cartoon dog">
      <circle cx="48" cy="52" r="31" fill="#d89954" />
      <path d="M23 42c-6-11-3-23 7-26 8 3 12 12 10 25z" fill="#734729" />
      <path d="M73 42c6-11 3-23-7-26-8 3-12 12-10 25z" fill="#734729" />
      <circle cx="36" cy="48" r="4" fill="#1a1210" />
      <circle cx="60" cy="48" r="4" fill="#1a1210" />
      <path d="M42 59c4 3 8 3 12 0" fill="none" stroke="#1a1210" strokeWidth="4" strokeLinecap="round" />
      <path d="M43 54h10l-5 6z" fill="#1a1210" />
      <path d="M26 69c13 13 31 13 44 0" fill="none" stroke="#f2ca89" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

function CatAvatar({ phase }: { phase: CompanionPhase }) {
  return (
    <svg className={`companion-avatar companion-avatar--cat is-${phase}`} viewBox="0 0 96 96" role="img" aria-label="Cartoon cat">
      <path d="M24 35 18 13l22 14m32 8 6-22-22 14" fill="#5a6970" />
      <circle cx="48" cy="52" r="31" fill="#7f9299" />
      <circle cx="36" cy="48" r="4" fill="#0b1112" />
      <circle cx="60" cy="48" r="4" fill="#0b1112" />
      <path d="M43 56h10l-5 6z" fill="#ffb7c5" />
      <path d="M48 61v7" stroke="#0b1112" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 60h-16m48 0h16M34 66H18m44 0h16" stroke="#e6f5f2" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
}
