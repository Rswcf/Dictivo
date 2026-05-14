import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ArrowUp, X } from "lucide-react";
import { installUpdate, type UpdateInfo } from "../lib/desktopBridge";

type BannerState =
  | { kind: "idle" }
  | { kind: "available"; info: UpdateInfo }
  | { kind: "expired"; info: UpdateInfo }
  | { kind: "installing" }
  | { kind: "ready-to-quit" }
  | { kind: "error"; message: string };

type UpdateBannerProps = {
  onRenewClick?: () => void;
};

export function UpdateBanner({ onRenewClick }: UpdateBannerProps) {
  const [state, setState] = useState<BannerState>({ kind: "idle" });
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    const subscriptions: Array<Promise<() => void>> = [
      listen<UpdateInfo>("dictivo://update-available", (event) => {
        setState({ kind: "available", info: event.payload });
      }),
      listen<UpdateInfo>("dictivo://update-window-expired", (event) => {
        setState({ kind: "expired", info: event.payload });
      })
    ];

    return () => {
      subscriptions.forEach((p) => {
        void p.then((fn) => fn());
      });
    };
  }, []);

  if (state.kind === "idle") return null;
  if ((state.kind === "available" || state.kind === "expired") && dismissedVersion === state.info.version) {
    return null;
  }

  if (state.kind === "available") {
    return (
      <div className="update-banner update-banner--available" role="status" aria-live="polite">
        <ArrowUp size={14} aria-hidden />
        <span className="update-banner__message">
          Dictivo {state.info.version} is ready.{" "}
          {state.info.notes ? <span className="update-banner__notes">{state.info.notes}</span> : null}
        </span>
        <div className="update-banner__actions">
          <button type="button" onClick={() => setDismissedVersion(state.info.version)}>
            Not this version
          </button>
          <button
            type="button"
            className="primary"
            onClick={async () => {
              setState({ kind: "installing" });
              try {
                await installUpdate();
                setState({ kind: "ready-to-quit" });
              } catch (error) {
                setState({
                  kind: "error",
                  message: error instanceof Error ? error.message : "Install failed."
                });
              }
            }}
          >
            Install on quit
          </button>
        </div>
        <button
          type="button"
          className="update-banner__close"
          onClick={() => setDismissedVersion(state.info.version)}
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  if (state.kind === "expired") {
    return (
      <div className="update-banner update-banner--expired" role="status">
        <span className="update-banner__message">
          A new Dictivo ({state.info.version}) is available, but your update window has ended.
          Your current version keeps working — renew for $24/year to install it.
        </span>
        <div className="update-banner__actions">
          <button type="button" onClick={() => setDismissedVersion(state.info.version)}>
            Not now
          </button>
          {onRenewClick ? (
            <button type="button" className="primary" onClick={onRenewClick}>
              Renew — $24/yr
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="update-banner__close"
          onClick={() => setDismissedVersion(state.info.version)}
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  if (state.kind === "installing") {
    return (
      <div className="update-banner update-banner--installing" role="status" aria-live="polite">
        <span className="update-banner__message">Downloading update…</span>
      </div>
    );
  }

  if (state.kind === "ready-to-quit") {
    return (
      <div className="update-banner update-banner--ready" role="status">
        <span className="update-banner__message">
          Update downloaded — it will install the next time you quit Dictivo.
        </span>
        <button
          type="button"
          className="update-banner__close"
          onClick={() => setState({ kind: "idle" })}
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="update-banner update-banner--error" role="alert">
      <span className="update-banner__message">{state.message}</span>
      <button
        type="button"
        className="update-banner__close"
        onClick={() => setState({ kind: "idle" })}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
