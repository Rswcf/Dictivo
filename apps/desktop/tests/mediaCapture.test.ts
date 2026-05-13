import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeWav, startAudioRecording } from "../src/lib/mediaCapture";

async function readWav(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  return {
    buffer,
    view: new DataView(buffer),
    text: (offset: number, length: number) =>
      String.fromCharCode(...new Uint8Array(buffer, offset, length))
  };
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = vi.fn((type: string) => type === "audio/webm;codecs=opus");

  listeners = new Map<string, Array<(event: any) => void>>();
  mimeType = "audio/webm;codecs=opus";
  failOnStop = false;
  startedWith?: number;

  constructor(public stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "audio/webm";
    FakeMediaRecorder.instances.push(this);
  }

  addEventListener(type: string, handler: (event: any) => void) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  start(timeslice?: number) {
    this.startedWith = timeslice;
  }

  stop() {
    this.emit(this.failOnStop ? "error" : "stop", {});
  }

  emit(type: string, event: any) {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];

  close = vi.fn().mockResolvedValue(undefined);
  destination = {};
  processor = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null as ((event: AudioProcessingEvent) => void) | null
  };
  sampleRate: number;
  sourceNode = {
    connect: vi.fn(),
    disconnect: vi.fn()
  };

  constructor(options?: AudioContextOptions) {
    this.sampleRate = options?.sampleRate ?? 44_100;
    FakeAudioContext.instances.push(this);
  }

  createMediaStreamSource = vi.fn(() => this.sourceNode);
  createScriptProcessor = vi.fn(() => this.processor);

  emitAudio(samples: Float32Array) {
    const output = new Float32Array(samples.length);
    this.processor.onaudioprocess?.({
      inputBuffer: { getChannelData: () => samples },
      outputBuffer: { getChannelData: () => output }
    } as unknown as AudioProcessingEvent);
    return output;
  }
}

class FailingAudioContext extends FakeAudioContext {
  createMediaStreamSource = vi.fn(() => {
    throw new Error("Audio source failed");
  });
}

function stubMicrophoneStream() {
  const stop = vi.fn();
  const stream = {
    getTracks: () => [{ stop }]
  } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  return { getUserMedia, stop };
}

afterEach(() => {
  FakeMediaRecorder.instances = [];
  FakeAudioContext.instances = [];
  vi.unstubAllGlobals();
});

describe("media capture WAV encoding", () => {
  it("writes a mono 16-bit PCM WAV header for local whisper.cpp", async () => {
    const blob = encodeWav(
      [new Float32Array([0, 0.5, -0.5]), new Float32Array([1, -1])],
      16_000,
      16_000
    );
    const wav = await readWav(blob);

    expect(blob.type).toBe("audio/wav");
    expect(wav.text(0, 4)).toBe("RIFF");
    expect(wav.text(8, 4)).toBe("WAVE");
    expect(wav.text(12, 4)).toBe("fmt ");
    expect(wav.text(36, 4)).toBe("data");
    expect(wav.view.getUint16(20, true)).toBe(1);
    expect(wav.view.getUint16(22, true)).toBe(1);
    expect(wav.view.getUint32(24, true)).toBe(16_000);
    expect(wav.view.getUint16(34, true)).toBe(16);
    expect(wav.view.getUint32(40, true)).toBe(10);
    expect(wav.buffer.byteLength).toBe(54);
  });

  it("resamples captured browser audio to the target whisper.cpp sample rate", async () => {
    const input = new Float32Array(480);
    input.fill(0.25);

    const blob = encodeWav([input], 48_000, 16_000);
    const wav = await readWav(blob);

    expect(wav.view.getUint32(24, true)).toBe(16_000);
    expect(wav.view.getUint32(40, true)).toBe(320);
    expect(wav.buffer.byteLength).toBe(364);
  });

  it("still produces a valid empty WAV file when no samples were captured", async () => {
    const blob = encodeWav([], 16_000, 16_000);
    const wav = await readWav(blob);

    expect(wav.text(0, 4)).toBe("RIFF");
    expect(wav.text(8, 4)).toBe("WAVE");
    expect(wav.view.getUint32(40, true)).toBe(0);
    expect(wav.buffer.byteLength).toBe(44);
  });
});

describe("media capture recording controller", () => {
  it("starts compressed microphone capture, returns a blob, and stops tracks", async () => {
    const microphone = stubMicrophoneStream();
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);

    const controller = await startAudioRecording("microphone", "compressed");
    const recorder = FakeMediaRecorder.instances[0]!;
    recorder.emit("dataavailable", { data: new Blob(["local audio"], { type: "audio/webm" }) });

    const blob = await controller.stop();

    expect(controller.format).toBe("compressed");
    expect(controller.source).toBe("microphone");
    expect(recorder.startedWith).toBe(500);
    expect(FakeMediaRecorder.isTypeSupported).toHaveBeenCalledWith("audio/webm;codecs=opus");
    expect(blob.type).toBe("audio/webm;codecs=opus");
    expect(await blob.text()).toBe("local audio");
    expect(microphone.stop).toHaveBeenCalledTimes(1);
    expect(microphone.getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: true,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });
  });

  it("cleans up microphone tracks when compressed recording fails", async () => {
    const microphone = stubMicrophoneStream();
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);

    const controller = await startAudioRecording("microphone", "compressed");
    FakeMediaRecorder.instances[0]!.failOnStop = true;

    await expect(controller.stop()).rejects.toThrow("Recording failed");
    expect(microphone.stop).toHaveBeenCalledTimes(1);
  });

  it("surfaces microphone permission denial before creating a controller", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error("Permission denied"));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    await expect(startAudioRecording("microphone", "compressed")).rejects.toThrow("Permission denied");
  });

  it("starts wav microphone capture, mutes monitor output, and stops tracks", async () => {
    const microphone = stubMicrophoneStream();
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const controller = await startAudioRecording("microphone", "wav");
    const context = FakeAudioContext.instances[0]!;
    const output = context.emitAudio(new Float32Array([0.25, -0.25]));

    const blob = await controller.stop();
    const wav = await readWav(blob);

    expect(controller.format).toBe("wav");
    expect(controller.source).toBe("microphone");
    expect(context.createMediaStreamSource).toHaveBeenCalled();
    expect(context.createScriptProcessor).toHaveBeenCalledWith(4096, 1, 1);
    expect(context.sourceNode.connect).toHaveBeenCalledWith(context.processor);
    expect(context.processor.connect).toHaveBeenCalledWith(context.destination);
    expect(Array.from(output)).toEqual([0, 0]);
    expect(context.processor.disconnect).toHaveBeenCalledTimes(1);
    expect(context.sourceNode.disconnect).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(microphone.stop).toHaveBeenCalledTimes(1);
    expect(blob.type).toBe("audio/wav");
    expect(wav.text(0, 4)).toBe("RIFF");
    expect(wav.view.getUint32(40, true)).toBe(4);
  });

  it("still releases microphone tracks when wav context shutdown fails", async () => {
    const microphone = stubMicrophoneStream();
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const controller = await startAudioRecording("microphone", "wav");
    const context = FakeAudioContext.instances[0]!;
    context.close.mockRejectedValueOnce(new Error("Audio context close failed"));

    await expect(controller.stop()).rejects.toThrow("Audio context close failed");
    expect(context.processor.disconnect).toHaveBeenCalledTimes(1);
    expect(context.sourceNode.disconnect).toHaveBeenCalledTimes(1);
    expect(microphone.stop).toHaveBeenCalledTimes(1);
  });

  it("releases microphone tracks when wav recorder setup fails", async () => {
    const microphone = stubMicrophoneStream();
    vi.stubGlobal("AudioContext", FailingAudioContext);

    await expect(startAudioRecording("microphone", "wav")).rejects.toThrow("Audio source failed");

    const context = FakeAudioContext.instances[0]!;
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(microphone.stop).toHaveBeenCalledTimes(1);
  });
});
