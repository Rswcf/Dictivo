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
  type RunnableTiers,
  type Tier
} from "../lib/desktopBridge";
import { TIER_DISPLAY } from "../lib/tierDisplay";

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
  const [catalogWarning, setCatalogWarning] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string>("");
  const [tiers, setTiers] = useState<RunnableTiers | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hw = await getHardwareProfile();
        const gpuList = await detectGpu().catch(() => []);
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
    let cancelled = false;
    (async () => {
      try {
        const catalog = await getPrivateFastModels();
        if (cancelled) return;
        setModels(catalog);
        setCatalogWarning("");
      } catch (e) {
        if (cancelled) return;
        const detail = e instanceof Error ? ` ${e.message}` : "";
        setCatalogWarning(`Model details are unavailable.${detail} Setup can continue with the recommended model id.`);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDownload = async () => {
    if (!hardware) return;
    setBusy(true);
    setError("");
    setProgressLabel("Downloading model...");
    try {
      await downloadPrivateFastModel(hardware.recommendedModelId);
      setProgressLabel("Running quick calibration...");
      setStep("calibrate");
      const rtf = await benchmarkTier(hardware.recommendedModelId);
      const runnable = await finalizeCalibration(rtf, hardware.recommendedModelId);
      setTiers(runnable);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
      setStep("pick");
    } finally {
      setBusy(false);
      setProgressLabel("");
    }
  };

  const recommended = hardware ? models.find((model) => model.id === hardware.recommendedModelId) : undefined;
  const setupButtonLabel = error ? "Try setup again" : "Download & set up";

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
            {error && <p className="error" role="alert">{error}</p>}
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
            {catalogWarning && <p className="muted" role="status">{catalogWarning}</p>}
            {error && <p className="error" role="alert">{error}</p>}
            <div className="wizard-actions">
              <button type="button" className="primary" disabled={busy} onClick={() => void handleDownload()}>
                {busy ? progressLabel || "Working..." : setupButtonLabel}
              </button>
	              <button type="button" className="ghost" disabled={busy} onClick={onComplete}>Skip setup</button>
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
            <SetupSummary tiers={tiers} />
            <div className="wizard-actions">
              <button type="button" className="primary" onClick={onComplete}>Start dictating →</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SetupSummary({ tiers }: { tiers: RunnableTiers }) {
  const otherTiers = (["fast", "slow"] as const).filter((tier) => tiers[tier].withinBudget);
  const otherNames = formatTierNames(otherTiers);
  const mediumCopy = tiers.medium.withinBudget ? (
    <>Your computer can run <strong>{TIER_DISPLAY.medium.name}</strong> smoothly.</>
  ) : (
    <>Your recommended <strong>{TIER_DISPLAY.medium.name}</strong> tier is ready, but it may run slowly.</>
  );

  return (
    <p>
      {mediumCopy}
      {otherNames
        ? ` ${otherNames} ${otherTiers.length === 1 ? "is" : "are"} also available.`
        : " Other tiers may run slowly on this hardware."}
      {!tiers.slow.withinBudget ? ` ${TIER_DISPLAY.slow.name} may run slowly on this hardware.` : ""}
    </p>
  );
}

function formatTierNames(tiers: Tier[]) {
  const names = tiers.map((tier) => TIER_DISPLAY[tier].name);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
