use base64::Engine;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig};
use serde::Serialize;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

const TARGET_SAMPLE_RATE: u32 = 16_000;
const LEVEL_SAMPLE_INTERVAL: Duration = Duration::from_millis(80);
const COMPANION_WAVEFORM_BANDS: usize = 7;

pub struct NativeRecorderState {
    command_tx: Mutex<mpsc::Sender<RecorderCommand>>,
}

enum RecorderCommand {
    Start {
        app: AppHandle,
        reply: mpsc::Sender<Result<NativeRecordingStarted, String>>,
    },
    Stop {
        reply: mpsc::Sender<Result<NativeRecordingStopped, String>>,
    },
}

struct ActiveNativeRecording {
    stream: Stream,
    samples: Arc<Mutex<Vec<f32>>>,
    sample_rate: u32,
    started_at_ms: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRecordingStarted {
    started_at: i64,
    sample_rate: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRecordingStopped {
    audio_base64: String,
    mime_type: String,
    started_at: i64,
    duration_ms: u128,
}

#[derive(Clone, Serialize)]
struct AudioLevelsPayload {
    bands: Vec<f32>,
}

impl Default for NativeRecorderState {
    fn default() -> Self {
        let (command_tx, command_rx) = mpsc::channel::<RecorderCommand>();
        thread::spawn(move || recorder_worker(command_rx));
        Self {
            command_tx: Mutex::new(command_tx),
        }
    }
}

#[tauri::command]
pub fn start_native_recording(
    app: AppHandle,
    state: State<'_, NativeRecorderState>,
) -> Result<NativeRecordingStarted, String> {
    let (reply, response) = mpsc::channel();
    state
        .command_tx
        .lock()
        .map_err(|_| "Native recorder state is unavailable.".to_string())?
        .send(RecorderCommand::Start { app, reply })
        .map_err(|_| "Native recorder worker is unavailable.".to_string())?;

    response
        .recv()
        .map_err(|_| "Native recorder worker stopped before recording started.".to_string())?
}

#[tauri::command]
pub fn stop_native_recording(
    state: State<'_, NativeRecorderState>,
) -> Result<NativeRecordingStopped, String> {
    let (reply, response) = mpsc::channel();
    state
        .command_tx
        .lock()
        .map_err(|_| "Native recorder state is unavailable.".to_string())?
        .send(RecorderCommand::Stop { reply })
        .map_err(|_| "Native recorder worker is unavailable.".to_string())?;

    response
        .recv()
        .map_err(|_| "Native recorder worker stopped before recording ended.".to_string())?
}

fn recorder_worker(command_rx: mpsc::Receiver<RecorderCommand>) {
    let mut active: Option<ActiveNativeRecording> = None;

    while let Ok(command) = command_rx.recv() {
        match command {
            RecorderCommand::Start { app, reply } => {
                let result = start_recording_on_worker(app, &mut active);
                let _ = reply.send(result);
            }
            RecorderCommand::Stop { reply } => {
                let result = stop_recording_on_worker(&mut active);
                let _ = reply.send(result);
            }
        }
    }
}

fn start_recording_on_worker(
    app: AppHandle,
    active: &mut Option<ActiveNativeRecording>,
) -> Result<NativeRecordingStarted, String> {
    if active.is_some() {
        return Err("A recording is already in progress.".to_string());
    }
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No microphone input device is available.".to_string())?;
    let supported = device
        .default_input_config()
        .map_err(|error| format!("Unable to open microphone input: {error}"))?;
    let sample_format = supported.sample_format();
    let config: StreamConfig = supported.into();
    let channels = usize::from(config.channels.max(1));
    let sample_rate = config.sample_rate.0;
    let samples = Arc::new(Mutex::new(Vec::<f32>::new()));
    let last_emit = Arc::new(Mutex::new(Instant::now()));

    let stream = match sample_format {
        SampleFormat::F32 => build_input_stream::<f32, _>(
            &device,
            &config,
            channels,
            app,
            samples.clone(),
            last_emit,
            |sample| sample,
        )?,
        SampleFormat::I16 => build_input_stream::<i16, _>(
            &device,
            &config,
            channels,
            app,
            samples.clone(),
            last_emit,
            |sample| sample as f32 / i16::MAX as f32,
        )?,
        SampleFormat::U16 => build_input_stream::<u16, _>(
            &device,
            &config,
            channels,
            app,
            samples.clone(),
            last_emit,
            |sample| (sample as f32 / u16::MAX as f32) * 2.0 - 1.0,
        )?,
        _ => {
            return Err(format!(
                "Unsupported microphone sample format: {sample_format:?}."
            ))
        }
    };

    stream
        .play()
        .map_err(|error| format!("Unable to start microphone recording: {error}"))?;

    let started_at_ms = (time::OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000) as i64;
    *active = Some(ActiveNativeRecording {
        stream,
        samples,
        sample_rate,
        started_at_ms,
    });

    Ok(NativeRecordingStarted {
        started_at: started_at_ms,
        sample_rate,
    })
}

fn stop_recording_on_worker(
    active: &mut Option<ActiveNativeRecording>,
) -> Result<NativeRecordingStopped, String> {
    let active = active
        .take()
        .ok_or_else(|| "No active native recording was found.".to_string())?;

    let ActiveNativeRecording {
        stream,
        samples,
        sample_rate,
        started_at_ms,
    } = active;
    drop(stream);

    let captured = samples
        .lock()
        .map_err(|_| "Recorded audio buffer is unavailable.".to_string())?
        .clone();
    let wav = encode_wav(&captured, sample_rate, TARGET_SAMPLE_RATE);
    let duration_ms = if sample_rate > 0 {
        ((captured.len() as u128) * 1000) / sample_rate as u128
    } else {
        0
    };

    Ok(NativeRecordingStopped {
        audio_base64: base64::engine::general_purpose::STANDARD.encode(wav),
        mime_type: "audio/wav".to_string(),
        started_at: started_at_ms,
        duration_ms,
    })
}

fn build_input_stream<T, F>(
    device: &cpal::Device,
    config: &StreamConfig,
    channels: usize,
    app: AppHandle,
    samples: Arc<Mutex<Vec<f32>>>,
    last_emit: Arc<Mutex<Instant>>,
    convert: F,
) -> Result<Stream, String>
where
    T: cpal::SizedSample + Send + Copy + 'static,
    F: Fn(T) -> f32 + Send + Sync + Copy + 'static,
{
    let err_fn = |error| eprintln!("[native-recorder] input stream error: {error}");
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                let mono = downmix_to_mono(data, channels, convert);
                if mono.is_empty() {
                    return;
                }

                if let Ok(mut captured) = samples.lock() {
                    captured.extend_from_slice(&mono);
                }

                if should_emit_levels(&last_emit) {
                    let bands = level_bands(&mono);
                    let _ = app.emit_to(
                        "companion",
                        "companion-audio-levels",
                        AudioLevelsPayload { bands },
                    );
                }
            },
            err_fn,
            None,
        )
        .map_err(|error| format!("Unable to configure microphone input: {error}"))
}

fn downmix_to_mono<T, F>(data: &[T], channels: usize, convert: F) -> Vec<f32>
where
    T: Copy,
    F: Fn(T) -> f32 + Copy,
{
    if channels <= 1 {
        return data.iter().copied().map(convert).collect();
    }

    data.chunks(channels)
        .map(|frame| {
            let sum = frame.iter().copied().map(convert).sum::<f32>();
            sum / frame.len().max(1) as f32
        })
        .collect()
}

fn should_emit_levels(last_emit: &Arc<Mutex<Instant>>) -> bool {
    let Ok(mut last) = last_emit.lock() else {
        return false;
    };
    if last.elapsed() < LEVEL_SAMPLE_INTERVAL {
        return false;
    }
    *last = Instant::now();
    true
}

fn level_bands(samples: &[f32]) -> Vec<f32> {
    if samples.is_empty() {
        return vec![0.0; COMPANION_WAVEFORM_BANDS];
    }

    let chunk_size = (samples.len() / COMPANION_WAVEFORM_BANDS).max(1);
    (0..COMPANION_WAVEFORM_BANDS)
        .map(|band| {
            let start = band * chunk_size;
            let end = if band == COMPANION_WAVEFORM_BANDS - 1 {
                samples.len()
            } else {
                ((band + 1) * chunk_size).min(samples.len())
            };
            if start >= samples.len() || start >= end {
                return 0.0;
            }

            let peak = samples[start..end]
                .iter()
                .fold(0.0_f32, |current, sample| current.max(sample.abs()));
            peak.clamp(0.0, 1.0).powf(0.6)
        })
        .collect()
}

fn encode_wav(samples: &[f32], input_sample_rate: u32, output_sample_rate: u32) -> Vec<u8> {
    let resampled = normalize_samples(&resample(samples, input_sample_rate, output_sample_rate));
    let data_bytes = resampled.len() * 2;
    let mut bytes = Vec::with_capacity(44 + data_bytes);

    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_bytes as u32).to_le_bytes());
    bytes.extend_from_slice(b"WAVE");
    bytes.extend_from_slice(b"fmt ");
    bytes.extend_from_slice(&16_u32.to_le_bytes());
    bytes.extend_from_slice(&1_u16.to_le_bytes());
    bytes.extend_from_slice(&1_u16.to_le_bytes());
    bytes.extend_from_slice(&output_sample_rate.to_le_bytes());
    bytes.extend_from_slice(&(output_sample_rate * 2).to_le_bytes());
    bytes.extend_from_slice(&2_u16.to_le_bytes());
    bytes.extend_from_slice(&16_u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&(data_bytes as u32).to_le_bytes());

    for sample in resampled {
        let clamped = sample.clamp(-1.0, 1.0);
        let pcm = if clamped < 0.0 {
            (clamped * 32768.0) as i16
        } else {
            (clamped * 32767.0) as i16
        };
        bytes.extend_from_slice(&pcm.to_le_bytes());
    }

    bytes
}

fn resample(samples: &[f32], input_sample_rate: u32, output_sample_rate: u32) -> Vec<f32> {
    if samples.is_empty() || input_sample_rate == 0 || input_sample_rate == output_sample_rate {
        return samples.to_vec();
    }

    let ratio = input_sample_rate as f64 / output_sample_rate as f64;
    let output_len = ((samples.len() as f64) / ratio).round().max(1.0) as usize;
    let mut output = Vec::with_capacity(output_len);

    for index in 0..output_len {
        let source_index = index as f64 * ratio;
        let lower = source_index.floor() as usize;
        let upper = (lower + 1).min(samples.len() - 1);
        let weight = (source_index - lower as f64) as f32;
        let sample = samples[lower] * (1.0 - weight) + samples[upper] * weight;
        output.push(sample);
    }

    output
}

fn normalize_samples(samples: &[f32]) -> Vec<f32> {
    let peak = samples
        .iter()
        .fold(0.0_f32, |current, sample| current.max(sample.abs()));
    if peak < 0.001 {
        return samples.to_vec();
    }

    let gain = (0.92 / peak).min(6.0);
    if (gain - 1.0).abs() < 0.01 {
        return samples.to_vec();
    }
    samples.iter().map(|sample| sample * gain).collect()
}

#[cfg(test)]
mod tests {
    use super::{downmix_to_mono, encode_wav, level_bands};

    #[test]
    fn downmixes_interleaved_audio_to_mono() {
        let mono = downmix_to_mono(&[0.5_f32, -0.25, 0.25, 0.75], 2, |sample| sample);
        assert_eq!(mono, vec![0.125, 0.5]);
    }

    #[test]
    fn computes_stable_level_band_count() {
        let bands = level_bands(&[0.0, 0.2, -0.4, 0.8, 0.1, 0.0, 0.3]);
        assert_eq!(bands.len(), 7);
        assert!(bands.iter().all(|band| (0.0..=1.0).contains(band)));
    }

    #[test]
    fn encodes_16khz_mono_pcm_wav() {
        let wav = encode_wav(&[0.0, 0.5, -0.5], 16_000, 16_000);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(u16::from_le_bytes([wav[20], wav[21]]), 1);
        assert_eq!(u16::from_le_bytes([wav[22], wav[23]]), 1);
        assert_eq!(
            u32::from_le_bytes([wav[24], wav[25], wav[26], wav[27]]),
            16_000
        );
        assert_eq!(u32::from_le_bytes([wav[40], wav[41], wav[42], wav[43]]), 6);
    }
}
