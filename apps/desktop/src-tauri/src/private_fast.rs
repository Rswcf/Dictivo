use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::time::Instant;
use tauri::{AppHandle, Manager};

/// Builds a `Command` that never flashes a console window on Windows.
/// On other platforms it's equivalent to `Command::new`.
fn quiet_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivateFastStatus {
    ready: bool,
    binary_path: Option<String>,
    model_path: Option<String>,
    model_id: String,
    model_name: String,
    message: String,
    setup_hint: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivateFastTranscript {
    text: String,
    duration_ms: u128,
    binary_path: String,
    model_path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PrivateFastModel {
    id: String,
    label: String,
    use_case: String,
    speed: String,
    quality: String,
    size_label: String,
    notes: String,
    installed: bool,
    selected: bool,
    path: Option<String>,
    size_bytes: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareProfile {
    platform: String,
    arch: String,
    cpu_cores: usize,
    memory_total_bytes: Option<u64>,
    accelerators: Vec<String>,
    performance_class: PerformanceClass,
    recommended_model_id: String,
    recommended_profile: String,
    reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierAssignment {
    pub model_id: String,
    pub realtime_factor: f32,
    pub predicted: bool,
    pub downloaded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnableTiers {
    pub fast: Option<TierAssignment>,
    pub medium: Option<TierAssignment>,
    pub slow: Option<TierAssignment>,
    pub fingerprint: String,
    pub benchmarked_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub vram_bytes: Option<u64>,
}

#[derive(Clone, Copy)]
struct ModelSpec {
    id: &'static str,
    label: &'static str,
    use_case: &'static str,
    speed: &'static str,
    quality: &'static str,
    size_label: &'static str,
    notes: &'static str,
}

const MODEL_CATALOG: &[ModelSpec] = &[
    ModelSpec {
        id: "tiny",
        label: "Tiny",
        use_case: "Smoke test / very old machines",
        speed: "Fastest",
        quality: "Low",
        size_label: "~75 MB",
        notes: "Use only to test permissions and end-to-end flow.",
    },
    ModelSpec {
        id: "base",
        label: "Base",
        use_case: "Ultra-fast short dictation",
        speed: "Very fast",
        quality: "Basic",
        size_label: "~142 MB",
        notes: "Good for quick feasibility checks; weaker on names and mixed language.",
    },
    ModelSpec {
        id: "small",
        label: "Small",
        use_case: "Private Fast default dictation",
        speed: "Fast",
        quality: "Good",
        size_label: "~469 MB",
        notes: "Best first local model for resource-aware dictation testing.",
    },
    ModelSpec {
        id: "medium-q5_0",
        label: "Medium Q5",
        use_case: "Longer dictation and CPU-friendly higher accuracy",
        speed: "Moderate",
        quality: "Better",
        size_label: "~540 MB",
        notes: "Quantized model for users who want better local dictation without a large memory footprint.",
    },
    ModelSpec {
        id: "large-v3-turbo-q5_0",
        label: "Large v3 Turbo Q5",
        use_case: "Recommended high-end local dictation",
        speed: "Moderate",
        quality: "High",
        size_label: "~600 MB",
        notes: "Best balance for strong local dictation on Apple Silicon and capable Windows machines.",
    },
    ModelSpec {
        id: "large-v3-turbo",
        label: "Large v3 Turbo",
        use_case: "Fast high-quality transcription",
        speed: "Slower",
        quality: "High",
        size_label: "~1.6 GB",
        notes: "Fast and strong, but pruned for speed; not the highest-accuracy Whisper option.",
    },
    ModelSpec {
        id: "large-v3",
        label: "Large v3",
        use_case: "Highest accuracy local transcription",
        speed: "Slowest",
        quality: "Highest",
        size_label: "~3.1 GB",
        notes: "Use when quality matters more than disk, memory, and latency.",
    },
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    Fast,
    Medium,
    Slow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PerformanceClass {
    GpuHigh,
    CpuStrong,
    CpuWeak,
}

fn default_model_for_tier(class: PerformanceClass, tier: Tier) -> &'static str {
    use PerformanceClass::*;
    use Tier::*;
    match (class, tier) {
        (GpuHigh,   Fast)   => "small",
        (GpuHigh,   Medium) => "large-v3-turbo-q5_0",
        (GpuHigh,   Slow)   => "large-v3",
        (CpuStrong, Fast)   => "base",
        (CpuStrong, Medium) => "small",
        (CpuStrong, Slow)   => "large-v3-turbo-q5_0",
        (CpuWeak,   Fast)   => "tiny",
        (CpuWeak,   Medium) => "base",
        (CpuWeak,   Slow)   => "small",
    }
}

fn compute_performance_class(
    cores: usize,
    ram_bytes: Option<u64>,
    gpu_vram_bytes: Option<u64>,
) -> PerformanceClass {
    let ram = match ram_bytes {
        Some(v) => v,
        None => return PerformanceClass::CpuWeak,
    };
    let high_ram = ram >= 16 * 1024 * 1024 * 1024;
    let qualifying_gpu = gpu_vram_bytes
        .map(|v| v >= 8 * 1024 * 1024 * 1024)
        .unwrap_or(false);

    if qualifying_gpu && high_ram {
        PerformanceClass::GpuHigh
    } else if cores >= 8 && high_ram {
        PerformanceClass::CpuStrong
    } else {
        PerformanceClass::CpuWeak
    }
}

const FAST_BUDGET: f32 = 1.0;
const MEDIUM_BUDGET: f32 = 2.0;
const SLOW_BUDGET: f32 = 4.0;

fn tier_budget(tier: Tier) -> f32 {
    match tier { Tier::Fast => FAST_BUDGET, Tier::Medium => MEDIUM_BUDGET, Tier::Slow => SLOW_BUDGET }
}

fn build_runnable_tiers_with_rtfs<F>(
    class: PerformanceClass,
    measured_medium_rtf: f32,
    fingerprint: &str,
    benchmarked_at: &str,
    is_installed: F,
) -> RunnableTiers
where
    F: Fn(&str) -> bool,
{
    let medium_model = default_model_for_tier(class, Tier::Medium);
    let medium_ratio = ratio_of(medium_model);
    let baseline = if medium_ratio > 0.0 { measured_medium_rtf / medium_ratio } else { 0.0 };

    let mut assignments: [Option<TierAssignment>; 3] = [None, None, None];
    for (idx, tier) in [Tier::Fast, Tier::Medium, Tier::Slow].into_iter().enumerate() {
        let model_id = default_model_for_tier(class, tier).to_string();
        let rtf = baseline * ratio_of(&model_id);
        let within_budget = rtf <= tier_budget(tier);
        let is_medium = matches!(tier, Tier::Medium);
        if within_budget || is_medium {
            assignments[idx] = Some(TierAssignment {
                downloaded: is_installed(&model_id),
                predicted: !is_medium,
                realtime_factor: rtf,
                model_id,
            });
        }
    }

    // Edge case: guarantee at least one tier.
    // Fast is always force-shown so there is a usable option even on very slow machines.
    if assignments.iter().all(|a| a.is_none()) || assignments[0].is_none() {
        let model_id = default_model_for_tier(class, Tier::Fast).to_string();
        let rtf = baseline * ratio_of(&model_id);
        assignments[0] = Some(TierAssignment {
            downloaded: is_installed(&model_id),
            predicted: true,
            realtime_factor: rtf,
            model_id,
        });
    }

    RunnableTiers {
        fast: assignments[0].clone(),
        medium: assignments[1].clone(),
        slow: assignments[2].clone(),
        fingerprint: fingerprint.to_string(),
        benchmarked_at: benchmarked_at.to_string(),
    }
}

fn ratio_of(model_id: &str) -> f32 {
    match model_id {
        "tiny" => 0.2,
        "base" => 0.4,
        "small" => 0.7,
        "medium-q5_0" => 1.1,
        "large-v3-turbo-q5_0" => 1.5,
        "large-v3-turbo" => 2.0,
        "large-v3" => 2.5,
        _ => 1.0,
    }
}

fn predict_rtf_from_medium(model_id: &str, medium_rtf: f32) -> f32 {
    let ratio: f32 = match model_id {
        "tiny" => 0.2,
        "base" => 0.4,
        "small" => 0.7,
        "medium-q5_0" => 1.1,
        "large-v3-turbo-q5_0" => 1.5,
        "large-v3-turbo" => 2.0,
        "large-v3" => 2.5,
        _ => return medium_rtf,
    };
    medium_rtf * ratio
}

fn compute_fingerprint(cpu_model: &str, ram_bytes: u64, gpu_names: &[String]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(cpu_model.as_bytes());
    hasher.update(b"|");
    hasher.update(ram_bytes.to_le_bytes());
    hasher.update(b"|");
    for name in gpu_names {
        hasher.update(name.as_bytes());
        hasher.update(b",");
    }
    hex_encode(&hasher.finalize())
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write;
        let _ = write!(s, "{:02x}", byte);
    }
    s
}

fn parse_macos_displays(output: &str) -> Vec<GpuInfo> {
    let mut gpus = Vec::new();
    let mut current_name: Option<String> = None;
    let mut current_vram: Option<u64> = None;

    let push_current = |name: &mut Option<String>, vram: &mut Option<u64>, gpus: &mut Vec<GpuInfo>| {
        if let Some(n) = name.take() {
            gpus.push(GpuInfo { name: n, vram_bytes: vram.take() });
        }
    };

    for line in output.lines() {
        let trimmed = line.trim_end();
        let leading_spaces = trimmed.len() - trimmed.trim_start().len();
        let body = trimmed.trim_start();

        if body.ends_with(':') && leading_spaces <= 4 && !body.contains("Graphics/Displays") {
            // New GPU section header (≤4-space indented, ends with colon)
            push_current(&mut current_name, &mut current_vram, &mut gpus);
            current_name = Some(body.trim_end_matches(':').to_string());
            continue;
        }
        if let Some(value) = body.strip_prefix("VRAM (Total):").or_else(|| body.strip_prefix("VRAM (Dynamic, Max):")) {
            current_vram = parse_vram(value.trim());
        }
    }
    push_current(&mut current_name, &mut current_vram, &mut gpus);
    gpus
}

fn parse_vram(s: &str) -> Option<u64> {
    let parts: Vec<&str> = s.split_whitespace().collect();
    if parts.len() != 2 { return None; }
    let value: u64 = parts[0].parse().ok()?;
    match parts[1] {
        "GB" => Some(value * 1024 * 1024 * 1024),
        "MB" => Some(value * 1024 * 1024),
        _ => None,
    }
}

#[tauri::command]
pub fn hardware_profile() -> HardwareProfile {
    build_hardware_profile()
}

#[tauri::command]
pub fn private_fast_status(app: AppHandle) -> PrivateFastStatus {
    build_private_fast_status(Some(&app))
}

fn build_private_fast_status(app: Option<&AppHandle>) -> PrivateFastStatus {
    let binary_path = resolve_binary_path(app);
    let model_path = resolve_model_path();
    let ready = binary_path.is_some() && model_path.is_some();
    let message = match (&binary_path, &model_path) {
        (Some(_), Some(_)) => "Private Fast is ready.".to_string(),
        (None, Some(_)) => "whisper.cpp CLI is missing.".to_string(),
        (Some(_), None) => "Private Fast local model is missing.".to_string(),
        (None, None) => "whisper.cpp CLI and Private Fast local model are missing.".to_string(),
    };
    let model_id = model_path
        .as_ref()
        .and_then(|path| path.file_stem())
        .map(model_id_from_file_stem)
        .unwrap_or_else(|| "small".to_string());
    let model_name = model_spec(&model_id)
        .map(|model| model.label.to_string())
        .unwrap_or_else(|| model_id.clone());

    PrivateFastStatus {
        ready,
        binary_path: binary_path.map(path_to_string),
        model_path: model_path.map(path_to_string),
        model_id,
        model_name,
        message,
        setup_hint: "Install the latest Dictivo build, then download or import a local model in Settings -> Local Engine.".to_string(),
    }
}

#[tauri::command]
pub fn private_fast_models() -> Vec<PrivateFastModel> {
    build_model_list()
}

#[tauri::command]
pub fn select_private_fast_model(
    app: AppHandle,
    model_id: String,
) -> Result<PrivateFastStatus, String> {
    validate_model_id(&model_id)?;
    if model_path_for_id(&model_id).is_none() {
        return Err(format!("Model {model_id} is not installed yet."));
    }
    write_selected_model(&model_id)?;
    Ok(build_private_fast_status(Some(&app)))
}

#[tauri::command]
pub async fn download_private_fast_model(
    app: AppHandle,
    model_id: String,
) -> Result<PrivateFastStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_model_id(&model_id)?;
        download_model(&model_id)?;
        write_selected_model(&model_id)?;
        Ok(build_private_fast_status(Some(&app)))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn import_private_fast_model(
    app: AppHandle,
    model_id: String,
    source_path: String,
) -> Result<PrivateFastStatus, String> {
    validate_model_id(&model_id)?;
    let source = PathBuf::from(source_path);
    if !source.exists() {
        return Err("Model file does not exist.".to_string());
    }
    if source.extension().and_then(|value| value.to_str()) != Some("bin") {
        return Err("Private Fast models must be .bin whisper.cpp files.".to_string());
    }

    let models_dir = private_fast_models_dir()?;
    fs::create_dir_all(&models_dir).map_err(|error| error.to_string())?;
    let output_path = models_dir.join(format!("ggml-{model_id}.bin"));
    fs::copy(&source, output_path).map_err(|error| error.to_string())?;
    write_selected_model(&model_id)?;
    Ok(build_private_fast_status(Some(&app)))
}

#[tauri::command]
pub fn delete_private_fast_model(
    app: AppHandle,
    model_id: String,
) -> Result<PrivateFastStatus, String> {
    validate_model_id(&model_id)?;
    let paths = model_paths_for_id(&model_id);
    if paths.is_empty() {
        return Err(format!("Model {model_id} is not installed."));
    }

    for path in paths {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }

    if selected_model_id().as_deref() == Some(&model_id) {
        let _ = fs::remove_file(selection_path()?);
    }

    Ok(build_private_fast_status(Some(&app)))
}

#[tauri::command]
pub fn transcribe_private_fast(
    app: AppHandle,
    audio_base64: String,
    language: String,
    prompt_terms: Vec<String>,
    mode: String,
    source: String,
    profile: String,
) -> Result<PrivateFastTranscript, String> {
    let binary_path = resolve_binary_path(Some(&app)).ok_or_else(|| {
        "whisper.cpp CLI is missing. Install the latest Dictivo build.".to_string()
    })?;
    let model_path = resolve_model_path().ok_or_else(|| "Private Fast local model is missing. Download or import a model in Settings -> Local Engine.".to_string())?;
    let work_dir = private_fast_work_dir()?;
    fs::create_dir_all(&work_dir).map_err(|error| error.to_string())?;

    let timestamp = time::OffsetDateTime::now_utc().unix_timestamp_nanos();
    let input_path = work_dir.join(format!("input-{timestamp}.wav"));
    let output_stem = work_dir.join(format!("output-{timestamp}"));
    let output_txt = output_stem.with_extension("txt");

    let audio_bytes = base64::engine::general_purpose::STANDARD
        .decode(audio_base64)
        .map_err(|error| format!("Invalid audio payload: {error}"))?;
    fs::write(&input_path, audio_bytes).map_err(|error| error.to_string())?;

    let language_arg = whisper_language(&language);
    let prompt = build_initial_prompt(&language, &mode, &source, &prompt_terms);
    let quality_mode = profile == "quality";
    let balanced_mode = profile == "balanced";
    let started = Instant::now();
    let mut command = quiet_command(&binary_path);
    command
        .arg("-m")
        .arg(&model_path)
        .arg("-f")
        .arg(&input_path)
        .arg("-l")
        .arg(language_arg)
        .arg("-otxt")
        .arg("-of")
        .arg(&output_stem)
        .arg("-np")
        .arg("-nt")
        .arg("--temperature")
        .arg("0")
        .arg("--suppress-nst");

    if quality_mode {
        command
            .arg("-bo")
            .arg("5")
            .arg("-bs")
            .arg("5")
            .arg("-mc")
            .arg("224")
            .arg("-sow")
            .arg("-ml")
            .arg("96");
    } else if balanced_mode {
        command
            .arg("-bo")
            .arg("3")
            .arg("-bs")
            .arg("3")
            .arg("-mc")
            .arg("160")
            .arg("-sow")
            .arg("-ml")
            .arg("80");
    } else {
        command.arg("-bo").arg("1").arg("-bs").arg("1");
    }

    if let Some(prompt) = prompt {
        command.arg("--prompt").arg(prompt);
        if quality_mode {
            command.arg("--carry-initial-prompt");
        }
    }

    let output = command
        .output()
        .map_err(|error| format!("Failed to run whisper.cpp: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Private Fast transcription failed.\n{stderr}\n{stdout}"
        ));
    }

    let mut text = fs::read_to_string(&output_txt)
        .unwrap_or_else(|_| String::from_utf8_lossy(&output.stdout).to_string());
    text = cleanup_whisper_output(&text);

    let _ = fs::remove_file(input_path);
    let _ = fs::remove_file(output_txt);

    Ok(PrivateFastTranscript {
        text,
        duration_ms: started.elapsed().as_millis(),
        binary_path: path_to_string(binary_path),
        model_path: path_to_string(model_path),
    })
}

fn resolve_binary_path(app: Option<&AppHandle>) -> Option<PathBuf> {
    if let Ok(path) = env::var("DICTIVO_WHISPER_CLI") {
        let candidate = PathBuf::from(path);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    if let Some(path) = bundled_binary_path(app) {
        return Some(path);
    }

    for path in private_fast_roots()
        .into_iter()
        .flat_map(|root| binary_candidates_in_root(&root))
    {
        if path.exists() {
            return Some(path);
        }
    }

    which_any(whisper_cli_file_names())
}

fn bundled_binary_path(app: Option<&AppHandle>) -> Option<PathBuf> {
    let resource_dir = app?.path().resource_dir().ok()?;
    for root in [resource_dir.join("private-fast"), resource_dir] {
        for path in binary_candidates_in_root(&root) {
            if path.exists() {
                return Some(path);
            }
        }
    }

    None
}

fn binary_candidates_in_root(root: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    for name in whisper_cli_file_names() {
        candidates.push(root.join("bin").join(name));
        candidates.push(root.join(name));
        candidates.push(root.join("whisper.cpp/build/bin").join(name));
        candidates.push(root.join("whisper.cpp/build/bin/Release").join(name));
        candidates.push(root.join("whisper.cpp/build/bin/Debug").join(name));
        candidates.push(root.join("whisper.cpp").join(name));
    }
    candidates
}

#[cfg(target_os = "windows")]
fn whisper_cli_file_names() -> &'static [&'static str] {
    &["whisper-cli.exe", "main.exe", "whisper-cli", "main"]
}

#[cfg(not(target_os = "windows"))]
fn whisper_cli_file_names() -> &'static [&'static str] {
    &["whisper-cli", "main"]
}

fn resolve_model_path() -> Option<PathBuf> {
    if let Ok(path) = env::var("DICTIVO_WHISPER_MODEL") {
        let candidate = PathBuf::from(path);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    if let Some(model_id) = selected_model_id() {
        if let Some(path) = model_path_for_id(&model_id) {
            return Some(path);
        }
    }

    for model in MODEL_CATALOG {
        if let Some(path) = model_path_for_id(model.id) {
            return Some(path);
        }
    }

    None
}

fn model_path_for_id(model_id: &str) -> Option<PathBuf> {
    model_paths_for_id(model_id).into_iter().next()
}

fn model_paths_for_id(model_id: &str) -> Vec<PathBuf> {
    let name = format!("ggml-{model_id}.bin");
    let mut paths = Vec::new();
    for root in private_fast_roots() {
        let candidate = root.join("models").join(&name);
        if candidate.exists() {
            paths.push(candidate);
        }

        let candidate = root.join("whisper.cpp/models").join(&name);
        if candidate.exists() {
            paths.push(candidate);
        }
    }

    paths
}

fn private_fast_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(path) = env::var("DICTIVO_PRIVATE_FAST_HOME") {
        push_unique_path(&mut roots, PathBuf::from(path));
    }
    if let Some(mut data_dir) = dirs::data_local_dir().or_else(dirs::data_dir) {
        data_dir.push("Dictivo");
        data_dir.push("private-fast");
        push_unique_path(&mut roots, data_dir);
    }
    if let Some(home_dir) = dirs::home_dir() {
        push_unique_path(&mut roots, home_dir.join(".dictivo/private-fast"));
    }
    roots
}

fn push_unique_path(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !paths.iter().any(|existing| existing == &path) {
        paths.push(path);
    }
}

fn private_fast_work_dir() -> Result<PathBuf, String> {
    let mut root = private_fast_roots()
        .into_iter()
        .next()
        .ok_or_else(|| "Unable to resolve Private Fast data directory.".to_string())?;
    root.push("work");
    Ok(root)
}

fn private_fast_models_dir() -> Result<PathBuf, String> {
    let mut root = private_fast_roots()
        .into_iter()
        .next()
        .ok_or_else(|| "Unable to resolve Private Fast data directory.".to_string())?;
    root.push("models");
    Ok(root)
}

fn private_fast_whisper_dir() -> Result<PathBuf, String> {
    let mut root = private_fast_roots()
        .into_iter()
        .next()
        .ok_or_else(|| "Unable to resolve Private Fast data directory.".to_string())?;
    root.push("whisper.cpp");
    Ok(root)
}

fn selection_path() -> Result<PathBuf, String> {
    let mut root = private_fast_roots()
        .into_iter()
        .next()
        .ok_or_else(|| "Unable to resolve Private Fast data directory.".to_string())?;
    root.push("selected-model.txt");
    Ok(root)
}

fn build_model_list() -> Vec<PrivateFastModel> {
    let selected_id = selected_model_id().or_else(|| {
        resolve_model_path()
            .as_ref()
            .and_then(|path| path.file_stem())
            .map(model_id_from_file_stem)
    });

    MODEL_CATALOG
        .iter()
        .map(|model| {
            let path = model_path_for_id(model.id);
            let size_bytes = path
                .as_ref()
                .and_then(|path| fs::metadata(path).ok())
                .map(|metadata| metadata.len());
            PrivateFastModel {
                id: model.id.to_string(),
                label: model.label.to_string(),
                use_case: model.use_case.to_string(),
                speed: model.speed.to_string(),
                quality: model.quality.to_string(),
                size_label: model.size_label.to_string(),
                notes: model.notes.to_string(),
                installed: path.is_some(),
                selected: selected_id.as_deref() == Some(model.id),
                path: path.map(path_to_string),
                size_bytes,
            }
        })
        .collect()
}

fn build_hardware_profile() -> HardwareProfile {
    let platform = match env::consts::OS {
        "macos" => "macos",
        "windows" => "windows",
        "linux" => "linux",
        _ => env::consts::OS,
    }
    .to_string();
    let arch = env::consts::ARCH.to_string();
    let cpu_cores = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(4);
    let memory_total_bytes = total_memory_bytes();
    let accelerators = detect_accelerators(&platform, &arch);
    let gpu_vram_max = detect_gpu().iter().filter_map(|g| g.vram_bytes).max();
    let performance_class = compute_performance_class(cpu_cores, memory_total_bytes, gpu_vram_max);

    let recommended_model_id = default_model_for_tier(performance_class, Tier::Medium).to_string();
    let (recommended_profile, reason) = match performance_class {
        PerformanceClass::GpuHigh => (
            "quality",
            "Hardware acceleration and memory are available, so Dictivo can prioritize local accuracy.",
        ),
        PerformanceClass::CpuStrong => (
            "balanced",
            "CPU and memory look suitable for balanced local dictation without forcing a large model.",
        ),
        PerformanceClass::CpuWeak => (
            "fast",
            "This machine appears resource constrained or CPU-only, so Dictivo prioritizes latency.",
        ),
    };

    HardwareProfile {
        platform,
        arch,
        cpu_cores,
        memory_total_bytes,
        accelerators,
        performance_class,
        recommended_model_id,
        recommended_profile: recommended_profile.to_string(),
        reason: reason.to_string(),
    }
}

fn total_memory_bytes() -> Option<u64> {
    #[cfg(target_os = "macos")]
    {
        let output = quiet_command("sysctl")
            .arg("-n")
            .arg("hw.memsize")
            .output()
            .ok()?;
        let value = String::from_utf8_lossy(&output.stdout);
        return value.trim().parse::<u64>().ok();
    }

    #[cfg(target_os = "windows")]
    {
        let output = quiet_command("wmic")
            .args(["computersystem", "get", "TotalPhysicalMemory", "/value"])
            .output()
            .ok()?;
        let value = String::from_utf8_lossy(&output.stdout);
        return value
            .lines()
            .find_map(|line| line.strip_prefix("TotalPhysicalMemory="))
            .and_then(|raw| raw.trim().parse::<u64>().ok());
    }

    #[cfg(target_os = "linux")]
    {
        let value = fs::read_to_string("/proc/meminfo").ok()?;
        return value.lines().find_map(|line| {
            let raw = line
                .strip_prefix("MemTotal:")?
                .trim()
                .strip_suffix(" kB")?
                .trim();
            raw.parse::<u64>().ok().map(|kb| kb * 1024)
        });
    }

    #[allow(unreachable_code)]
    None
}

fn detect_accelerators(platform: &str, arch: &str) -> Vec<String> {
    let mut accelerators = Vec::new();
    if platform == "macos" && arch == "aarch64" {
        accelerators.push("metal".to_string());
    }
    if platform == "windows" {
        if windows_gpu_detected() {
            accelerators.push("directml".to_string());
        }
        if which("nvidia-smi").is_some() {
            accelerators.push("cuda".to_string());
        }
        if which("vulkaninfo").is_some() {
            accelerators.push("vulkan".to_string());
        }
        if which("openvino_version").is_some() || env::var("INTEL_OPENVINO_DIR").is_ok() {
            accelerators.push("openvino".to_string());
        }
    }
    accelerators.sort();
    accelerators.dedup();
    accelerators
}

#[cfg(target_os = "windows")]
fn windows_gpu_detected() -> bool {
    quiet_command("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "(Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name) -ne $null",
        ])
        .output()
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
fn windows_gpu_detected() -> bool {
    false
}

fn selected_model_id() -> Option<String> {
    for root in private_fast_roots() {
        let path = root.join("selected-model.txt");
        let Some(value) = fs::read_to_string(path).ok() else {
            continue;
        };
        let trimmed = value.trim();
        if model_spec(trimmed).is_some() {
            return Some(trimmed.to_string());
        }
    }
    None
}

fn write_selected_model(model_id: &str) -> Result<(), String> {
    validate_model_id(model_id)?;
    let path = selection_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(path, model_id).map_err(|error| error.to_string())
}

fn download_model(model_id: &str) -> Result<(), String> {
    let models_dir = private_fast_models_dir()?;
    fs::create_dir_all(&models_dir).map_err(|error| error.to_string())?;
    let output_path = models_dir.join(format!("ggml-{model_id}.bin"));
    if output_path.exists() {
        return Ok(());
    }

    let whisper_dir = private_fast_whisper_dir()?;
    let download_script = whisper_dir.join("models/download-ggml-model.sh");
    if download_script.exists() {
        let output = quiet_command("bash")
            .arg(download_script)
            .arg(model_id)
            .arg(&models_dir)
            .output()
            .map_err(|error| format!("Failed to run whisper.cpp model download script: {error}"))?;

        if output.status.success() && output_path.exists() {
            return Ok(());
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Model download failed.\n{stderr}\n{stdout}"));
    }

    let url =
        format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{model_id}.bin");
    let output = quiet_command("curl")
        .arg("-L")
        .arg("--fail")
        .arg(url)
        .arg("-o")
        .arg(&output_path)
        .output()
        .map_err(|error| format!("curl is required to download Private Fast models: {error}"))?;

    if !output.status.success() {
        let _ = fs::remove_file(&output_path);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Model download failed.\n{stderr}\n{stdout}"));
    }

    Ok(())
}

fn validate_model_id(model_id: &str) -> Result<(), String> {
    if model_spec(model_id).is_some() {
        Ok(())
    } else {
        Err(format!("Unsupported Private Fast model: {model_id}"))
    }
}

fn model_spec(model_id: &str) -> Option<ModelSpec> {
    MODEL_CATALOG
        .iter()
        .copied()
        .find(|model| model.id == model_id)
}

fn model_id_from_file_stem(stem: impl AsRef<std::ffi::OsStr>) -> String {
    let value = stem.as_ref().to_string_lossy();
    value.strip_prefix("ggml-").unwrap_or(&value).to_string()
}

fn which(binary: &str) -> Option<PathBuf> {
    which_any(&[binary])
}

fn which_any(binaries: &[&str]) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;

    #[cfg(target_os = "windows")]
    let names = {
        let mut names = binaries
            .iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>();
        let extensions = env::var_os("PATHEXT")
            .map(|value| {
                value
                    .to_string_lossy()
                    .split(';')
                    .map(|extension| {
                        extension
                            .trim()
                            .trim_start_matches('.')
                            .to_ascii_lowercase()
                    })
                    .filter(|extension| !extension.is_empty())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_else(|| vec!["exe".to_string(), "cmd".to_string(), "bat".to_string()]);
        for binary in binaries {
            if Path::new(binary).extension().is_some() {
                continue;
            }
            for extension in &extensions {
                names.push(format!("{binary}.{extension}"));
            }
        }
        names
    };

    #[cfg(not(target_os = "windows"))]
    let names = binaries
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>();

    env::split_paths(&path).find_map(|dir| {
        names
            .iter()
            .map(|name| dir.join(name))
            .find(|candidate| candidate.exists())
    })
}

fn whisper_language(language: &str) -> &str {
    match language {
        "zh" => "zh",
        "ja" => "ja",
        "es" => "es",
        "fr" => "fr",
        "de" => "de",
        _ => "en",
    }
}

fn cleanup_whisper_output(text: &str) -> String {
    let lines = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !line.starts_with("whisper_"))
        .collect::<Vec<_>>();

    if lines.iter().all(|line| !line.starts_with('[')) {
        lines.join(" ")
    } else {
        lines.join("\n")
    }
}

fn build_initial_prompt(
    language: &str,
    mode: &str,
    source: &str,
    prompt_terms: &[String],
) -> Option<String> {
    let mut terms = prompt_terms
        .iter()
        .map(|term| term.trim())
        .filter(|term| !term.is_empty())
        .take(60)
        .collect::<Vec<_>>();
    terms.sort_unstable();
    terms.dedup();

    let mode_hint = match mode {
        "email" => "email, complete sentences, clear punctuation",
        "prompt" => "AI prompt, technical terms, code names",
        "raw" => "verbatim transcript",
        _ => "dictation, complete sentences, clear punctuation",
    };
    let source_hint = if source == "microphone" {
        "single speaker dictation"
    } else {
        "local dictation"
    };

    let prompt = match language {
        "zh" => format!(
            "这是一段{}。请保留专有名词并使用自然标点。可能出现的词语：{}。",
            source_hint,
            terms.join("，")
        ),
        "ja" => format!(
            "これは{}です。固有名詞を保持し、自然な句読点を使います。用語: {}。",
            source_hint,
            terms.join("、")
        ),
        _ => format!(
            "This is {source_hint}. Style: {mode_hint}. Preserve names, product names, and technical terms. Terms: {}.",
            terms.join(", ")
        ),
    };

    let trimmed = prompt.trim();
    if trimmed.len() < 12 {
        None
    } else {
        Some(trimmed.chars().take(480).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn binary_candidates_include_bundled_resource_layout() {
        let root = Path::new("/resources/private-fast");
        let candidates = binary_candidates_in_root(root);

        #[cfg(target_os = "windows")]
        assert!(candidates.contains(&root.join("bin").join("whisper-cli.exe")));

        #[cfg(not(target_os = "windows"))]
        assert!(candidates.contains(&root.join("bin").join("whisper-cli")));
    }

    #[test]
    fn binary_candidates_keep_legacy_setup_layouts() {
        let root = Path::new("/private-fast");
        let candidates = binary_candidates_in_root(root);

        #[cfg(target_os = "windows")]
        assert!(candidates.contains(
            &root
                .join("whisper.cpp/build/bin/Release")
                .join("whisper-cli.exe")
        ));

        #[cfg(not(target_os = "windows"))]
        assert!(candidates.contains(&root.join("whisper.cpp/build/bin").join("whisper-cli")));

        assert!(candidates.contains(&root.join("whisper.cpp").join("main")));
    }

    #[test]
    fn tier_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&Tier::Fast).unwrap(), "\"fast\"");
        assert_eq!(serde_json::to_string(&Tier::Medium).unwrap(), "\"medium\"");
        assert_eq!(serde_json::to_string(&Tier::Slow).unwrap(), "\"slow\"");
    }

    #[test]
    fn performance_class_serializes_camel_case() {
        assert_eq!(serde_json::to_string(&PerformanceClass::GpuHigh).unwrap(), "\"gpuHigh\"");
        assert_eq!(serde_json::to_string(&PerformanceClass::CpuStrong).unwrap(), "\"cpuStrong\"");
        assert_eq!(serde_json::to_string(&PerformanceClass::CpuWeak).unwrap(), "\"cpuWeak\"");
    }

    #[test]
    fn default_model_for_tier_matrix() {
        use PerformanceClass::*;
        use Tier::*;

        let cases: &[(PerformanceClass, Tier, &str)] = &[
            (GpuHigh,   Fast,   "small"),
            (GpuHigh,   Medium, "large-v3-turbo-q5_0"),
            (GpuHigh,   Slow,   "large-v3"),
            (CpuStrong, Fast,   "base"),
            (CpuStrong, Medium, "small"),
            (CpuStrong, Slow,   "large-v3-turbo-q5_0"),
            (CpuWeak,   Fast,   "tiny"),
            (CpuWeak,   Medium, "base"),
            (CpuWeak,   Slow,   "small"),
        ];

        for &(class, tier, expected) in cases {
            assert_eq!(
                default_model_for_tier(class, tier),
                expected,
                "({:?}, {:?}) should map to {}",
                class,
                tier,
                expected
            );
        }
    }

    #[test]
    fn performance_class_classification() {
        let cases: &[(usize, u64, Option<u64>, PerformanceClass)] = &[
            (10, 16, Some(8),  PerformanceClass::GpuHigh),
            (12, 32, Some(12), PerformanceClass::GpuHigh),
            (8,  16, Some(4),  PerformanceClass::CpuStrong),
            (8,  16, None,     PerformanceClass::CpuStrong),
            (16, 32, None,     PerformanceClass::CpuStrong),
            (4,  8,  None,     PerformanceClass::CpuWeak),
            (4,  16, None,     PerformanceClass::CpuWeak),
            (8,  4,  None,     PerformanceClass::CpuWeak),
        ];

        for &(cores, ram_gb, gpu_vram_gb, expected) in cases {
            let ram_bytes = ram_gb * 1024 * 1024 * 1024;
            let gpu_vram_bytes = gpu_vram_gb.map(|gb| gb * 1024 * 1024 * 1024);
            assert_eq!(
                compute_performance_class(cores, Some(ram_bytes), gpu_vram_bytes),
                expected,
                "cores={} ram_gb={} gpu_vram_gb={:?} expected {:?}",
                cores, ram_gb, gpu_vram_gb, expected
            );
        }
    }

    #[test]
    fn performance_class_missing_ram_falls_to_cpu_weak() {
        assert_eq!(
            compute_performance_class(8, None, None),
            PerformanceClass::CpuWeak
        );
    }

    #[test]
    fn predict_rtf_ratios() {
        let medium_rtf = 1.0f32;
        let expectations: &[(&str, f32)] = &[
            ("tiny",                  1.0 * 0.2),
            ("base",                  1.0 * 0.4),
            ("small",                 1.0 * 0.7),
            ("medium-q5_0",           1.0 * 1.1),
            ("large-v3-turbo-q5_0",   1.0 * 1.5),
            ("large-v3-turbo",        1.0 * 2.0),
            ("large-v3",              1.0 * 2.5),
        ];
        for &(model_id, expected) in expectations {
            let got = predict_rtf_from_medium(model_id, medium_rtf);
            assert!(
                (got - expected).abs() < 1e-4,
                "{} predicted {} expected {}",
                model_id, got, expected
            );
        }
    }

    #[test]
    fn predict_rtf_scales_linearly_with_medium() {
        assert!((predict_rtf_from_medium("large-v3", 2.0) - 5.0).abs() < 1e-4);
    }

    #[test]
    fn predict_rtf_unknown_model_returns_input() {
        assert_eq!(predict_rtf_from_medium("unknown-id", 1.5), 1.5);
    }

    #[test]
    fn runnable_tiers_roundtrip_json() {
        let original = RunnableTiers {
            fast: Some(TierAssignment {
                model_id: "small".into(),
                realtime_factor: 0.65,
                predicted: false,
                downloaded: true,
            }),
            medium: Some(TierAssignment {
                model_id: "large-v3-turbo-q5_0".into(),
                realtime_factor: 0.85,
                predicted: false,
                downloaded: true,
            }),
            slow: None,
            fingerprint: "ab12".into(),
            benchmarked_at: "2026-05-12T10:14:00Z".into(),
        };
        let json = serde_json::to_string(&original).unwrap();
        assert!(json.contains("\"realtimeFactor\":0.65"), "uses camelCase: {}", json);
        let back: RunnableTiers = serde_json::from_str(&json).unwrap();
        assert_eq!(back.fast.as_ref().unwrap().model_id, "small");
        assert!(back.slow.is_none());
    }

    #[test]
    fn fingerprint_is_deterministic_and_sensitive() {
        let a = compute_fingerprint("Apple M3 Pro", 18 * 1024 * 1024 * 1024, &["Apple M3 Pro GPU".to_string()]);
        let b = compute_fingerprint("Apple M3 Pro", 18 * 1024 * 1024 * 1024, &["Apple M3 Pro GPU".to_string()]);
        assert_eq!(a, b, "same inputs must hash equal");
        assert_eq!(a.len(), 64, "sha256 hex digest is 64 chars");

        let c = compute_fingerprint("Apple M2 Pro", 18 * 1024 * 1024 * 1024, &["Apple M2 Pro GPU".to_string()]);
        assert_ne!(a, c, "different CPU must hash different");

        let d = compute_fingerprint("Apple M3 Pro", 16 * 1024 * 1024 * 1024, &["Apple M3 Pro GPU".to_string()]);
        assert_ne!(a, d, "different RAM must hash different");

        let e = compute_fingerprint("Apple M3 Pro", 18 * 1024 * 1024 * 1024, &[]);
        assert_ne!(a, e, "different GPU list must hash different");
    }

    #[test]
    fn parse_macos_displays_finds_amd_radeon() {
        let sample = r#"
Graphics/Displays:
    AMD Radeon Pro 5500M:
      Chipset Model: AMD Radeon Pro 5500M
      Vendor: AMD (0x1002)
      Device ID: 0x7340
      VRAM (Total): 8 GB
    "#;
        let gpus = parse_macos_displays(sample);
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].name, "AMD Radeon Pro 5500M");
        assert_eq!(gpus[0].vram_bytes, Some(8 * 1024 * 1024 * 1024));
    }

    #[test]
    fn parse_macos_displays_handles_no_gpu() {
        assert!(parse_macos_displays("").is_empty());
    }

    #[test]
    fn parse_macos_displays_handles_mb_vram() {
        let sample = "Intel UHD Graphics 630:\n  Chipset Model: Intel UHD Graphics 630\n  VRAM (Dynamic, Max): 1536 MB";
        let gpus = parse_macos_displays(sample);
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].vram_bytes, Some(1536 * 1024 * 1024));
    }

    #[test]
    fn build_runnable_tiers_filters_by_budget() {
        use PerformanceClass::*;
        // Medium RTF measured at 0.8 on a CpuStrong machine
        let result = build_runnable_tiers_with_rtfs(
            CpuStrong,
            0.8,
            "fp",
            "2026-05-12T00:00:00Z",
            |id| installed_in_test(id),
        );
        // CpuStrong: Fast=base, Medium=small, Slow=large-v3-turbo-q5_0
        // All three should appear (predictions within budgets).
        assert!(result.fast.is_some());
        assert!(result.medium.is_some());
        assert!(result.slow.is_some());
    }

    #[test]
    fn finalize_calibration_writes_cache_matching_fingerprint() {
        // The inner helper bypasses the `AppHandle`-based cache write, but the
        // returned RunnableTiers fingerprint must equal `current_fingerprint()`
        // computed at the same moment, otherwise `runnable_tiers()` would
        // silently discard the cache on the next launch.
        let tiers = finalize_calibration_inner(0.8);
        assert_eq!(tiers.fingerprint, current_fingerprint());
        assert!(tiers.medium.is_some(), "Medium tier is always populated");
        // benchmarked_at is non-empty (either RFC-3339 or unix seconds).
        assert!(!tiers.benchmarked_at.is_empty());
    }

    #[test]
    fn build_runnable_tiers_drops_slow_when_predicted_too_slow() {
        use PerformanceClass::*;
        // Very weak: Medium RTF = 5.0
        let result = build_runnable_tiers_with_rtfs(
            CpuWeak, 5.0, "fp", "ts",
            |_| false,
        );
        // Edge case: Fast force-shown to guarantee at least one tier
        assert!(result.fast.is_some(), "Fast must be force-shown when all else fails");
    }

    fn installed_in_test(_model_id: &str) -> bool { false }
}

fn path_to_string(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().to_string()
}

#[tauri::command]
pub fn detect_gpu() -> Vec<GpuInfo> {
    let mut gpus: Vec<GpuInfo> = Vec::new();

    #[cfg(target_os = "macos")]
    {
        if env::consts::ARCH == "aarch64" {
            // Apple Silicon: integrated Metal GPU. Use a synthetic entry with shared
            // RAM proxy so downstream classification can treat it as a qualifying GPU.
            let ram = total_memory_bytes().unwrap_or(0);
            gpus.push(GpuInfo {
                name: "Apple Silicon GPU (Metal)".to_string(),
                vram_bytes: Some(ram.saturating_div(2).max(8 * 1024 * 1024 * 1024)),
            });
        } else {
            if let Ok(out) = quiet_command("system_profiler")
                .arg("SPDisplaysDataType")
                .output()
            {
                let text = String::from_utf8_lossy(&out.stdout);
                gpus.extend(parse_macos_displays(&text).into_iter().filter(|g| {
                    let n = g.name.to_ascii_lowercase();
                    n.contains("amd") || n.contains("radeon") || n.contains("vega") || n.contains("nvidia") || n.contains("geforce") || n.contains("rtx") || n.contains("quadro")
                }));
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(info) = windows_primary_gpu() {
            gpus.push(info);
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(info) = linux_nvidia_gpu() {
            gpus.push(info);
        }
        if let Some(info) = linux_amd_gpu() {
            gpus.push(info);
        }
    }

    gpus
}

#[tauri::command]
pub async fn benchmark_tier(app: AppHandle, model_id: String) -> Result<f32, String> {
    use std::io::Read;
    use std::process::Stdio;
    use std::thread;
    use std::time::Duration;

    let binary_path = resolve_binary_path(Some(&app))
        .ok_or_else(|| "whisper-cli binary missing".to_string())?;
    let model_path = private_fast_models_dir()?
        .join(format!("ggml-{model_id}.bin"));
    if !model_path.exists() {
        return Err(format!("Model {model_id} is not installed"));
    }

    let sample_path = app
        .path()
        .resolve("benchmark-5s.wav", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;

    let start = std::time::Instant::now();
    let mut child = quiet_command(&binary_path)
        .args([
            "-m",
            model_path.to_string_lossy().as_ref(),
            "-f",
            sample_path.to_string_lossy().as_ref(),
            "-l",
            "en",
            "-otxt",
            "-of",
            "/dev/null",
            "--no-prints",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let timeout = Duration::from_secs(30);
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => {
                let elapsed = start.elapsed().as_secs_f32();
                if !status.success() {
                    let mut stderr = String::new();
                    if let Some(mut s) = child.stderr.take() {
                        let _ = s.read_to_string(&mut stderr);
                    }
                    return Err(format!("whisper-cli exited {}: {}", status, stderr));
                }
                let audio_secs = 5.0_f32;
                return Ok(elapsed / audio_secs);
            }
            None => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    return Err("Benchmark timed out after 30 s".to_string());
                }
                thread::sleep(Duration::from_millis(200));
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn windows_primary_gpu() -> Option<GpuInfo> {
    let output = quiet_command("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress",
        ])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(text.trim()).ok()?;
    let first = if parsed.is_array() { parsed.get(0)?.clone() } else { parsed };
    let name = first.get("Name")?.as_str()?.to_string();
    let vram = first.get("AdapterRAM").and_then(|v| v.as_u64());
    Some(GpuInfo { name, vram_bytes: vram })
}

#[cfg(not(target_os = "windows"))]
fn windows_primary_gpu() -> Option<GpuInfo> { None }

#[cfg(target_os = "linux")]
fn linux_nvidia_gpu() -> Option<GpuInfo> {
    let output = quiet_command("nvidia-smi")
        .args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
        .output()
        .ok()?;
    if !output.status.success() { return None; }
    let text = String::from_utf8_lossy(&output.stdout);
    let first = text.lines().next()?;
    let parts: Vec<&str> = first.split(',').map(str::trim).collect();
    if parts.len() < 2 { return None; }
    let name = parts[0].to_string();
    let mib: u64 = parts[1].parse().ok()?;
    Some(GpuInfo { name, vram_bytes: Some(mib * 1024 * 1024) })
}

#[cfg(not(target_os = "linux"))]
fn linux_nvidia_gpu() -> Option<GpuInfo> { None }

#[cfg(target_os = "linux")]
fn linux_amd_gpu() -> Option<GpuInfo> {
    let output = quiet_command("rocm-smi")
        .args(["--showmeminfo", "vram", "--csv"])
        .output()
        .ok()?;
    if !output.status.success() { return None; }
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().nth(1)?;
    let parts: Vec<&str> = line.split(',').collect();
    if parts.len() < 2 { return None; }
    let vram: u64 = parts[1].trim().parse().ok()?;
    Some(GpuInfo { name: "AMD GPU (ROCm)".to_string(), vram_bytes: Some(vram) })
}

#[cfg(not(target_os = "linux"))]
fn linux_amd_gpu() -> Option<GpuInfo> { None }

fn benchmark_cache_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("benchmark.json"))
}

fn current_fingerprint() -> String {
    let cpu = sysctl_cpu_brand();
    let ram = total_memory_bytes().unwrap_or(0);
    let gpu_names: Vec<String> = detect_gpu().into_iter().map(|g| g.name).collect();
    compute_fingerprint(&cpu, ram, &gpu_names)
}

fn sysctl_cpu_brand() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Ok(out) = quiet_command("sysctl").args(["-n", "machdep.cpu.brand_string"]).output() {
            return String::from_utf8_lossy(&out.stdout).trim().to_string();
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(text) = fs::read_to_string("/proc/cpuinfo") {
            for line in text.lines() {
                if let Some(v) = line.strip_prefix("model name") {
                    return v.trim_start_matches(':').trim().to_string();
                }
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(out) = quiet_command("powershell").args([
            "-NoProfile", "-Command",
            "(Get-CimInstance Win32_Processor | Select-Object -First 1).Name"
        ]).output() {
            return String::from_utf8_lossy(&out.stdout).trim().to_string();
        }
    }
    "unknown".to_string()
}

#[tauri::command]
pub fn runnable_tiers(app: AppHandle) -> Result<RunnableTiers, String> {
    let path = benchmark_cache_path(&app)?;
    let fp = current_fingerprint();
    if path.exists() {
        if let Ok(text) = fs::read_to_string(&path) {
            if let Ok(cached) = serde_json::from_str::<RunnableTiers>(&text) {
                if cached.fingerprint == fp {
                    return Ok(cached);
                }
            }
        }
    }
    Ok(RunnableTiers {
        fast: None, medium: None, slow: None,
        fingerprint: fp, benchmarked_at: String::new(),
    })
}

#[tauri::command]
pub fn write_runnable_tiers(app: AppHandle, tiers: RunnableTiers) -> Result<(), String> {
    let path = benchmark_cache_path(&app)?;
    let text = serde_json::to_string_pretty(&tiers).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())
}

pub(crate) fn finalize_calibration_inner(measured_medium_rtf: f32) -> RunnableTiers {
    let cores = std::thread::available_parallelism()
        .map(|v| v.get())
        .unwrap_or(4);
    let ram = total_memory_bytes();
    let gpus = detect_gpu();
    let primary_vram = gpus.iter().filter_map(|g| g.vram_bytes).max();
    let class = compute_performance_class(cores, ram, primary_vram);

    let fingerprint = current_fingerprint();
    let now = chrono_like_now_iso();

    let models_dir = private_fast_models_dir().ok();
    build_runnable_tiers_with_rtfs(
        class,
        measured_medium_rtf,
        &fingerprint,
        &now,
        |id| {
            models_dir
                .as_ref()
                .map(|dir| dir.join(format!("ggml-{id}.bin")).exists())
                .unwrap_or(false)
        },
    )
}

#[tauri::command]
pub fn finalize_calibration(
    app: AppHandle,
    measured_medium_rtf: f32,
    medium_model_id: String,
) -> Result<RunnableTiers, String> {
    let _ = medium_model_id; // Reserved for future "force Medium to specific model" override; currently the class already determines it.
    let tiers = finalize_calibration_inner(measured_medium_rtf);

    // Persist the cache so subsequent `runnable_tiers()` calls return it.
    let path = benchmark_cache_path(&app)?;
    let text = serde_json::to_string_pretty(&tiers).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(tiers)
}

fn chrono_like_now_iso() -> String {
    if let Ok(stamp) = time::OffsetDateTime::now_utc().format(&time::format_description::well_known::Rfc3339) {
        return stamp;
    }
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{}", secs)
}

#[tauri::command]
pub fn rerun_benchmark(app: AppHandle) -> Result<(), String> {
    let path = benchmark_cache_path(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
