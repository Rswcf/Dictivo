/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { scheduleChime } from "../src/lib/sounds";

function makeFakeContext() {
  const oscillator = {
    type: "" as OscillatorType,
    frequency: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn()
    },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn()
  };
  const gainNode = {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn()
    },
    connect: vi.fn()
  };
  oscillator.connect.mockReturnValue(gainNode);
  gainNode.connect.mockReturnValue(undefined);

  return {
    currentTime: 100,
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gainNode),
    destination: {} as AudioDestinationNode,
    state: "running" as AudioContextState,
    oscillator,
    gainNode
  };
}

describe("scheduleChime", () => {
  it("schedules a rising sine wave with the requested envelope", () => {
    const fake = makeFakeContext();

    scheduleChime(fake as unknown as AudioContext, {
      startFreq: 660,
      endFreq: 880,
      duration: 0.12,
      gain: 0.15
    });

    expect(fake.oscillator.type).toBe("sine");

    // Frequency ramps from start → end across the chime duration.
    expect(fake.oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(660, 100);
    expect(fake.oscillator.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(880, 100.12);

    // Gain envelope: 0 → peak (10 ms attack) → near-zero decay.
    expect(fake.gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0, 100);
    expect(fake.gainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.15, 100.01);
    expect(fake.gainNode.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, 100.18);

    // The oscillator is started and stopped within the chime window plus a
    // short safety tail; the test pins the actual numbers so a future tweak
    // doesn't silently change perceptible duration.
    expect(fake.oscillator.start).toHaveBeenCalledWith(100);
    expect(fake.oscillator.stop).toHaveBeenCalledWith(100.2);
  });

  it("supports a falling chime (start higher than end)", () => {
    const fake = makeFakeContext();
    scheduleChime(fake as unknown as AudioContext, {
      startFreq: 880,
      endFreq: 660,
      duration: 0.14,
      gain: 0.12
    });
    expect(fake.oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(880, 100);
    expect(fake.oscillator.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(660, 100.14);
  });

  it("swallows errors when the audio graph can't be constructed", () => {
    const broken = {
      currentTime: 0,
      createOscillator: () => {
        throw new Error("audio backend unavailable");
      }
    } as unknown as AudioContext;

    expect(() => scheduleChime(broken, { startFreq: 660, endFreq: 880, duration: 0.12, gain: 0.15 })).not.toThrow();
  });
});
