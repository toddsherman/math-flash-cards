import { recordDiagnostic } from "./diagnostics";
import buzzer from "./incorrect-sound.json";
import cheer from "./correct-sound.json";

// Keep feedback in memory: no media-element seeking or file decoding on a tap.
export class FeedbackAudio {
  private context: AudioContext;
  private buffers: AudioBuffer[];
  private source: AudioBufferSourceNode | null = null;
  private request = 0;
  private soundLabel = "Feedback";

  constructor() {
    this.context = new AudioContext({ latencyHint: "interactive" });
    this.buffers = [this.makeSampleBuffer(buzzer), this.makeSampleBuffer(cheer)];
    this.context.onstatechange = () => recordDiagnostic(`Audio engine: ${this.context.state}`);
    recordDiagnostic(`Feedback buffers ready · audio engine ${this.context.state}`);
  }

  private makeSampleBuffer(sample: { pcm16Base64: string; sampleRate: number }) {
    const bytes = Uint8Array.from(atob(sample.pcm16Base64), character => character.charCodeAt(0));
    const pcm = new DataView(bytes.buffer);
    const buffer = this.context.createBuffer(1, bytes.length / 2, sample.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = pcm.getInt16(i * 2, true) / 32768;
    return buffer;
  }

  play(correct: boolean): Promise<void> {
    this.stop();
    const request = this.request;
    const startedAt = performance.now();
    const label = correct ? "Correct cheer" : "Incorrect buzzer";
    const start = () => {
      if (request !== this.request || this.context.state === "closed") return;
      const source = this.context.createBufferSource();
      source.buffer = this.buffers[correct ? 1 : 0];
      source.connect(this.context.destination);
      source.onended = () => { source.disconnect(); if (this.source === source) { this.source = null; recordDiagnostic(`${label}: finished`); } };
      this.source = source;
      this.soundLabel = label;
      source.start();
      recordDiagnostic(`${label}: started · engine ${this.context.state} · ${Math.round(performance.now() - startedAt)} ms to schedule`);
    };
    if (this.context.state === "running") { start(); return Promise.resolve(); }
    // resume is invoked directly from the user gesture, including the first tap.
    recordDiagnostic(`${label}: waiting for audio engine (${this.context.state})`);
    return this.context.resume().then(start);
  }

  unlock() {
    // Warm the audio output on the first interaction, even a swipe or gear tap.
    if (this.context.state !== "running" && this.context.state !== "closed") {
      void this.context.resume().catch(() => {});
    }
  }

  stop() {
    this.request++;
    if (this.source) { this.source.stop(); recordDiagnostic(`${this.soundLabel}: stopped`); }
    this.source = null;
  }

  dispose() { this.stop(); this.context.onstatechange = null; void this.context.close(); }
}
