import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize, PhysicalPosition, primaryMonitor } from "@tauri-apps/api/window";
import { ChevronRight, Eye, Settings as SettingsIcon, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import irisAvatarImage from "../assets/avatars/iris-companion.png";
import marcusAvatarImage from "../assets/avatars/marcus-companion.png";
import { DEFAULT_HOTKEYS, type CompanionAvatar } from "../lib/settingsStore";
import { buildCompanionSnapshot, type CompanionPhase, type CompanionSnapshot } from "../lib/companion";
import { snapToWorkAreaEdge } from "../lib/companionWindowPosition";
import { formatShortcutForDisplay } from "../lib/hotkeys";

// Pointer-gesture tunables for batch 4. Picked so a deliberate tap (~120 ms)
// clearly reads as a tap, while a brief mouse jiggle on press never trips
// drag mode by accident.
const DRAG_THRESHOLD_PX = 5;
const TAP_MAX_MS = 250;
const LONG_PRESS_MS = 600;

// Batch 1 design language for the companion window:
//   D — the state "halo" lives on the avatar wrap (.companion-avatar-wrap),
//       driven by CSS based on .companion-shell--<phase>. Replaces the older
//       boxy emote badge so visual state info lives next to the avatar
//       instead of as a floating tag.
//   C — the bubble uses backdrop-filter blur for a native macOS glass feel.
// Both changes are CSS-only beyond removing the emote element below.

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

// Window dimensions in logical pixels. The idle size is just the avatar (76 px
// box) plus the .companion-shell 8 px padding on each side, so the visible
// avatar lands exactly where it does in the expanded state — no eye-jumps
// when collapsing back to idle.
const IDLE_WINDOW_SIZE = { width: 92, height: 92 } as const;
const EXPANDED_WINDOW_SIZE = { width: 360, height: 100 } as const;

const SILENT_BANDS: number[] = [0, 0, 0, 0, 0, 0, 0];

export function CompanionWindow() {
  const [snapshot, setSnapshot] = useState<CompanionSnapshot>(defaultSnapshot);
  const [now, setNow] = useState(Date.now());
  const [audioBands, setAudioBands] = useState<number[]>(SILENT_BANDS);
  const lastAppliedPhaseRef = useRef<CompanionPhase | null>(null);

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

  // Live waveform feed — fired from the main window's recording loop every
  // ~80 ms. We only render the waveform during phase === "recording" but we
  // subscribe unconditionally so the next recording starts visualising
  // immediately without a subscribe-time race.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listen<{ bands: number[] }>("companion-audio-levels", (event) => {
      const next = event.payload?.bands;
      if (Array.isArray(next) && next.length > 0) setAudioBands(next);
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Reset the waveform back to silent the moment recording stops so the next
  // phase doesn't briefly show stale levels frozen at their last value.
  useEffect(() => {
    if (snapshot.phase !== "recording") setAudioBands(SILENT_BANDS);
  }, [snapshot.phase]);

  /**
   * Batch 2 — collapse the window down to just the avatar in idle, expand to
   * the full bubble width when anything is happening. The shrunk window has
   * no transparent click-trap region around it, which keeps the rest of the
   * screen clickable when Dictivo is dormant.
   *
   * The resize fires on every phase transition. We track the last applied
   * phase in a ref to avoid a redundant Tauri IPC call when react re-renders
   * for an unrelated state change (timer tick, custom-avatar swap, etc.).
   */
  useEffect(() => {
    const phase = snapshot.phase;
    if (lastAppliedPhaseRef.current === phase) return;
    lastAppliedPhaseRef.current = phase;

    const target = phase === "idle" ? IDLE_WINDOW_SIZE : EXPANDED_WINDOW_SIZE;
    void getCurrentWindow()
      .setSize(new LogicalSize(target.width, target.height))
      .catch((error) => {
        // Surface this — it almost always means a missing Tauri capability
        // (e.g. `core:window:allow-set-size` not added to capabilities).
        // Swallowed previously, which hid the v0.2.3 resize regression.
        console.warn("CompanionWindow: setSize failed", error);
      });
  }, [snapshot.phase]);

  useEffect(() => {
    if (snapshot.phase !== "recording") return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [snapshot.phase]);

  const elapsed = useMemo(() => {
    if (!snapshot.recordingStartedAt) return "00:00";
    return formatElapsed(Math.max(0, Math.floor((now - snapshot.recordingStartedAt) / 1000)));
  }, [now, snapshot.recordingStartedAt]);

  const hideCompanion = useCallback(() => {
    void emitTo("main", "companion-hide-requested", {});
    void getCurrentWindow().hide().catch(() => undefined);
  }, []);

  const openSettings = useCallback(() => {
    void emitTo("main", "companion-open-settings", {});
  }, []);

  const showMainWindow = useCallback(() => {
    void emitTo("main", "companion-show-main", {});
  }, []);

  /**
   * After Tauri's startDragging promise resolves, the user has released the
   * mouse and the window is at its new position. We then (a) optionally
   * snap to the nearest work-area edge and (b) report the final position
   * to the main window so it can persist the user's choice across launches.
   */
  const handleDragEnd = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      const [outerPos, outerSize, monitor] = await Promise.all([
        win.outerPosition(),
        win.outerSize(),
        primaryMonitor()
      ]);
      if (!monitor) return;
      const snapped = snapToWorkAreaEdge(
        { x: outerPos.x, y: outerPos.y },
        { width: outerSize.width, height: outerSize.height },
        { position: monitor.position, size: monitor.size }
      );
      if (snapped) {
        await win.setPosition(new PhysicalPosition(snapped.x, snapped.y));
      }
      const finalPos = snapped ?? { x: outerPos.x, y: outerPos.y };
      void emitTo("main", "companion-position-changed", finalPos);
    } catch {
      // Position queries can fail mid-Space-switch; the only consequence is
      // we don't persist the new position this drag, which is acceptable.
    }
  }, []);

  // === F — pointer-gesture state machine ===
  // Single short tap → toggle dictation.
  // Long press (≥600ms, no drag) → show context menu.
  // Movement past DRAG_THRESHOLD_PX → start a native window drag.
  // All three live in one onPointerDown so they share start-coords + start-
  // time and don't conflict with each other.
  const gestureRef = useRef<{
    startedAt: number;
    startX: number;
    startY: number;
    longPressTimer: number;
    consumed: boolean; // true once we've routed to drag / long-press / tap
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const handlePointerDown = (event: React.PointerEvent) => {
    // Only react to primary mouse button / single-touch. Anything else
    // (right-click, multi-touch) falls through to the platform.
    if (event.button !== 0) return;
    if (event.target instanceof HTMLElement && event.target.closest("[data-no-gesture]")) {
      // Children opt out (hide button, menu items). They handle their own clicks.
      return;
    }

    const longPressTimer = window.setTimeout(() => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.consumed) return;
      gesture.consumed = true;
      setMenuOpen(true);
    }, LONG_PRESS_MS);

    gestureRef.current = {
      startedAt: Date.now(),
      startX: event.clientX,
      startY: event.clientY,
      longPressTimer,
      consumed: false
    };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.consumed) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;

    gesture.consumed = true;
    window.clearTimeout(gesture.longPressTimer);
    void getCurrentWindow()
      .startDragging()
      .then(handleDragEnd)
      .catch(() => undefined);
  };

  const handlePointerUp = () => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    window.clearTimeout(gesture.longPressTimer);

    if (!gesture.consumed) {
      const elapsedMs = Date.now() - gesture.startedAt;
      if (elapsedMs < TAP_MAX_MS) {
        // Short tap with no drag, no long-press → toggle recording.
        void emitTo("main", "companion-toggle-dictation", {});
      }
    }
    gestureRef.current = null;
  };

  const handlePointerCancel = () => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    window.clearTimeout(gesture.longPressTimer);
    gestureRef.current = null;
  };

  // Close the menu on Escape / outside click. We can't rely on the native
  // <details> element because the menu sits inside a transparent Tauri
  // window where bubbling can stop at unexpected places.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <section
      className={`companion-shell companion-shell--${snapshot.phase}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      aria-label="Dictivo floating recording status"
      data-phase={snapshot.phase}
    >
      <div
        className="companion-avatar-wrap"
        role="img"
        aria-label={ariaLabelForPhase(snapshot.phase)}
      >
        <CartoonAvatar
          avatar={snapshot.avatar}
          customAvatarDataUrl={snapshot.customAvatarDataUrl}
          customAvatarName={snapshot.customAvatarName}
          phase={snapshot.phase}
        />
      </div>

      <div className="companion-bubble">
        <button
          className="companion-hide-button"
          type="button"
          title="Hide companion"
          aria-label="Hide companion"
          data-no-gesture
          onClick={hideCompanion}
        >
          <X size={11} />
        </button>

        <div className="companion-title-row">
          <div className="companion-title">{snapshot.title}</div>
          {snapshot.phase === "recording" ? (
            <Waveform bands={audioBands} />
          ) : null}
        </div>
        {snapshot.phase === "recording" ? (
          <div className="companion-timer">{elapsed}</div>
        ) : null}
        <div className="companion-sub">{snapshot.detail || snapshot.summary}</div>
      </div>

      {menuOpen ? (
        <div className="companion-menu" role="menu" data-no-gesture>
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); showMainWindow(); }}>
            <Eye size={13} /> Show Dictivo
            <ChevronRight size={12} className="companion-menu-chevron" />
          </button>
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); openSettings(); }}>
            <SettingsIcon size={13} /> Settings
            <ChevronRight size={12} className="companion-menu-chevron" />
          </button>
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); hideCompanion(); }}>
            <X size={13} /> Hide companion
          </button>
          <button type="button" role="menuitem" className="companion-menu-dismiss" onClick={() => setMenuOpen(false)}>
            Dismiss
          </button>
        </div>
      ) : null}
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
  if (avatar === "iris") {
    return (
      <img
        className={`companion-avatar companion-avatar--iris is-${phase}`}
        src={irisAvatarImage}
        alt="Iris companion"
        draggable={false}
      />
    );
  }
  if (avatar === "marcus") {
    return (
      <img
        className={`companion-avatar companion-avatar--marcus is-${phase}`}
        src={marcusAvatarImage}
        alt="Marcus companion"
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

function Waveform({ bands }: { bands: number[] }) {
  return (
    <div className="companion-waveform" aria-hidden>
      {bands.map((value, index) => (
        <span
          key={index}
          style={{ height: `${Math.round(4 + Math.min(1, value) * 16)}px` }}
        />
      ))}
    </div>
  );
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
}

/**
 * Screen-reader label for the avatar halo. The halo is purely decorative for
 * sighted users (a colored ring around the avatar that reflects the recording
 * state), but VoiceOver users still need to hear what state Dictivo is in.
 */
function ariaLabelForPhase(phase: CompanionPhase): string {
  switch (phase) {
    case "recording":  return "Dictivo is recording";
    case "processing": return "Dictivo is transcribing";
    case "complete":   return "Dictivo finished — transcript copied";
    case "error":      return "Dictivo encountered an error";
    case "blocked":    return "Dictivo needs setup";
    default:           return "Dictivo is ready";
  }
}
