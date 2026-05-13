export type RecordingController = {
  startedAt: number;
  format: RecordingFormat;
  source: "microphone";
  stop: () => Promise<Blob>;
};

export type RecordingFormat = "compressed" | "wav";

const mimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg"
];

type CapturedStream = {
  stream: MediaStream;
  cleanup: () => Promise<void> | void;
};

export async function startAudioRecording(
  source: RecordingController["source"],
  format: RecordingFormat = "compressed"
): Promise<RecordingController> {
  const capture = await createMicrophoneStream();
  return format === "wav" ? startWavRecording(source, capture) : startCompressedRecording(source, capture);
}

async function startCompressedRecording(
  source: RecordingController["source"],
  capture: CapturedStream
): Promise<RecordingController> {
  const chunks: BlobPart[] = [];
  const mimeType = mimeTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  const recorder = new MediaRecorder(capture.stream, mimeType ? { mimeType } : undefined);

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  recorder.start(500);

  return {
    startedAt: Date.now(),
    format: "compressed",
    source,
    stop: () =>
      new Promise((resolve, reject) => {
        recorder.addEventListener(
          "stop",
          async () => {
            await capture.cleanup();
            resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
          },
          { once: true }
        );
        recorder.addEventListener(
          "error",
          async () => {
            await capture.cleanup();
            reject(new Error("Recording failed"));
          },
          { once: true }
        );
        recorder.stop();
      })
  };
}

async function startWavRecording(
  source: RecordingController["source"],
  capture: CapturedStream
): Promise<RecordingController> {
  let context: AudioContext | null = null;

  try {
    context = new AudioContext({ sampleRate: 16000 });
    const activeContext = context;
    const sourceNode = activeContext.createMediaStreamSource(capture.stream);
    const processor = activeContext.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(input));
      event.outputBuffer.getChannelData(0).fill(0);
    };

    sourceNode.connect(processor);
    processor.connect(activeContext.destination);

    return {
      startedAt: Date.now(),
      format: "wav",
      source,
      stop: async () => {
        try {
          processor.disconnect();
          sourceNode.disconnect();
          await activeContext.close();
        } finally {
          await capture.cleanup();
        }
        return encodeWav(chunks, activeContext.sampleRate, 16000);
      }
    };
  } catch (error) {
    if (context) await context.close().catch(() => undefined);
    await capture.cleanup();
    throw error;
  }
}

async function createMicrophoneStream(): Promise<CapturedStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: true,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true
    }
  });
  return {
    stream,
    cleanup: () => {
      stream.getTracks().forEach((track) => track.stop());
    }
  };
}

export function encodeWav(chunks: Float32Array[], inputSampleRate: number, outputSampleRate: number) {
  const samples = normalizeSamples(resample(flattenChunks(chunks), inputSampleRate, outputSampleRate));
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outputSampleRate, true);
  view.setUint32(28, outputSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: "audio/wav" });
}

function normalizeSamples(samples: Float32Array) {
  if (samples.length === 0) return samples;

  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }
  if (peak < 0.001) return samples;

  const targetPeak = 0.92;
  const maxGain = 6;
  const gain = Math.min(targetPeak / peak, maxGain);
  if (Math.abs(gain - 1) < 0.01) return samples;

  const normalized = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    normalized[index] = (samples[index] ?? 0) * gain;
  }
  return normalized;
}

function flattenChunks(chunks: Float32Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const samples = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return samples;
}

function resample(samples: Float32Array, inputRate: number, outputRate: number) {
  if (samples.length === 0) return samples;
  if (inputRate === outputRate) return samples;

  const ratio = inputRate / outputRate;
  const length = Math.max(1, Math.floor(samples.length / ratio));
  const resampled = new Float32Array(length);

  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = position - left;
    resampled[index] = (samples[left] ?? 0) * (1 - weight) + (samples[right] ?? 0) * weight;
  }

  return resampled;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
