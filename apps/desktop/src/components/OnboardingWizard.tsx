import { useEffect, useState } from "react";
import {
  benchmarkTier,
  detectGpu,
  downloadPrivateFastModel,
  finalizeCalibration,
  getHardwareProfile,
  getPrivateFastModels,
  type GpuInfo,
  type HardwareProfile,
  type PrivateFastModel,
  type RunnableTiers
} from "../lib/desktopBridge";

type Step = "scan" | "pick" | "calibrate" | "done";

type OnboardingWizardProps = {
  onComplete: () => void;
};

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>("scan");
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [gpus, setGpus] = useState<GpuInfo[]>([]);
  const [models, setModels] = useState<PrivateFastModel[]>([]);
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string>("");
  const [tiers, setTiers] = useState<RunnableTiers | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [hw, gpuList] = await Promise.all([getHardwareProfile(), detectGpu()]);
        if (cancelled) return;
        setHardware(hw);
        setGpus(gpuList);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Hardware scan failed");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    void getPrivateFastModels().then(setModels).catch(() => {});
  }, []);

  const handleDownload = async () => {
    if (!hardware) return;
    setBusy(true);
    setError("");
    setProgressLabel("Downloading model...");
    try {
      // TODO: pre-flight disk-free check before downloading (see spec §6).
      // statvfs requires platform-specific bindings; deferred until a Rust helper exists.
      await downloadPrivateFastModel(hardware.recommendedModelId);
      setProgressLabel("Running quick calibration...");
      setStep("calibrate");
      const rtf = await benchmarkTier(hardware.recommendedModelId);
      const runnable = await finalizeCalibration(rtf, hardware.recommendedModelId);
      setTiers(runnable);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setBusy(false);
      setProgressLabel("");
    }
  };

  const recommended = hardware ? models.find((model) => model.id === hardware.recommendedModelId) : undefined;

  return (
    <div className="wizard-shell">
      <div className="wizard-card">
        <div className="wizard-steps">
          <span className={step === "scan" ? "on" : ""}>1</span>
          <span className={step === "pick" ? "on" : ""}>2</span>
          <span className={step === "calibrate" || step === "done" ? "on" : ""}>3</span>
        </div>

        {step === "scan" && (
          <section>
            <h2>Looking at your computer</h2>
            {!hardware && !error && <p className="muted">Detecting...</p>}
            {hardware && (
              <ul className="hw-list">
                <li>CPU · {hardware.cpuCores} cores</li>
                <li>RAM · {Math.round((hardware.memoryTotalBytes ?? 0) / 1024 ** 3)} GB</li>
                <li>GPU · {gpus.length > 0 ? (gpus[0]?.name ?? "Unknown") : "Not detected"}</li>
              </ul>
            )}
            {error && <p className="error">{error}</p>}
            <div className="wizard-actions">
              <button type="button" className="primary" disabled={!hardware} onClick={() => setStep("pick")}>
                Continue →
              </button>
              <button type="button" className="ghost" onClick={onComplete}>Skip setup</button>
            </div>
          </section>
        )}

        {step === "pick" && hardware && (
          <section>
            <h2>Recommended for your hardware</h2>
            <p className="muted">
              Recommended: <strong>{recommended?.label ?? hardware.recommendedModelId}</strong>
              {recommended?.sizeLabel ? ` · ${recommended.sizeLabel}` : ""} — best balance for your hardware.
            </p>
            {error && <p className="error">{error}</p>}
            <div className="wizard-actions">
              <button type="button" className="primary" disabled={busy} onClick={() => void handleDownload()}>
                {busy ? progressLabel || "Working..." : "Download & set up"}
              </button>
              <button type="button" className="ghost" onClick={onComplete}>Skip setup</button>
            </div>
          </section>
        )}

        {step === "calibrate" && (
          <section>
            <h2>Quick calibration</h2>
            <p className="muted">{progressLabel || "Running a five-second sample..."}</p>
          </section>
        )}

        {step === "done" && tiers && (
          <section>
            <h2>Ready</h2>
            {tiers.fast && tiers.slow ? (
              <p>Your computer can run <strong>Medium</strong> smoothly. Fast and Slow are also available.</p>
            ) : tiers.fast ? (
              <p>Your computer can run <strong>Medium</strong> smoothly. Fast is also available.</p>
            ) : (
              <p>Only <strong>Medium</strong> is available on this hardware.</p>
            )}
            <div className="wizard-actions">
              <button type="button" className="primary" onClick={onComplete}>Start dictating →</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
