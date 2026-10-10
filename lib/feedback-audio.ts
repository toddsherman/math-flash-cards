import { recordDiagnostic } from "./diagnostics";
import buzzer from "./incorrect-sound.json";
import cheer from "./correct-sound.json";

// Request media playback on Safari so feedback and spoken numbers share mute behavior.
export function configureAudioSession() {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) {
    try { session.type = "playback"; }
    catch (error) { recordDiagnostic(`Audio session setup failed: ${String(error)}`); }
  }
}

// Samples stay bundled in memory; rebuilding an interrupted engine needs no download.
export class FeedbackAudio {
  private context!: AudioContext;
  private buffers!: AudioBuffer[];
  private source: AudioBufferSourceNode | null = null;
  private request = 0;
  private soundLabel = "Feedback";
  private broken = false;
  private disposed = false;
  private monitor: ReturnType<typeof setInterval> | null = null;
  private cancel: (() => void) | null = null;

  constructor() { this.createEngine(); }

  private createEngine() {
    configureAudioSession();
    this.context = new AudioContext({ latencyHint: "interactive" });
    this.buffers = [buzzer, cheer].map(sample => {
      const bytes = Uint8Array.from(atob(sample.pcm16Base64), c => c.charCodeAt(0));
      const pcm = new DataView(bytes.buffer);
      const buffer = this.context.createBuffer(1, bytes.length / 2, sample.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = pcm.getInt16(i * 2, true) / 32768;
      return buffer;
    });
    this.broken = false;
    this.context.onstatechange = () => recordDiagnostic(`Audio engine: ${this.context.state}`);
    recordDiagnostic(`Feedback buffers ready · audio engine ${this.context.state}`);
  }

  get ready() { return !this.broken && !this.disposed && this.context.state === "running"; }

  // Called on return from background. Rebuild inside the next authorized tap.
  invalidate() { this.stop(); this.broken = true; }

  play(correct: boolean): Promise<void> {
    this.stop();
    if (this.disposed) return Promise.reject(new Error("Audio engine disposed"));
    if (this.broken || this.context.state === "closed") {
      const old = this.context;
      old.onstatechange = null;
      void old.close().catch(() => {});
      recordDiagnostic("Rebuilding audio engine on tap");
      this.createEngine();
    }
    const request = this.request;
    const context = this.context;
    const label = correct ? "Correct cheer" : "Incorrect buzzer";
    const startedAt = performance.now();
    return new Promise<void>((resolve, reject) => {
      let clock = context.currentTime;
      let lastProgress = performance.now();
      let started = false;
      const fail = (error: unknown) => {
        if (request !== this.request) return;
        this.broken = true;
        recordDiagnostic(`${label}: failed · ${String(error)} · engine ${context.state}`);
        this.cancel = null;
        this.stop();
        reject(error);
      };
      // Cancellation settles the old request without showing a false error.
      this.cancel = resolve;
      this.monitor = setInterval(() => {
        const now = performance.now();
        if (!started) {
          if (now - startedAt > 1800) fail(new Error("Audio engine did not resume. Tap to retry."));
        } else {
          if (context.currentTime > clock) { clock = context.currentTime; lastProgress = now; }
          if (now - lastProgress > 1200) fail(new Error("Audio clock stalled. Tap to retry."));
        }
      }, 200);
      const start = () => {
        if (request !== this.request) return;
        if (context.state !== "running") { fail(new Error(`Audio engine is ${context.state}`)); return; }
        try {
          const source = context.createBufferSource();
          source.buffer = this.buffers[correct ? 1 : 0];
          source.connect(context.destination);
          source.onended = () => {
            source.disconnect();
            if (this.source !== source) return;
            this.source = null;
            if (this.monitor) clearInterval(this.monitor);
            this.monitor = null;
            this.cancel = null;
            recordDiagnostic(`${label}: finished`);
            resolve();
          };
          this.source = source;
          this.soundLabel = label;
          source.start();
          started = true;
          clock = context.currentTime;
          lastProgress = performance.now();
          recordDiagnostic(`${label}: started · engine ${context.state} · ${Math.round(lastProgress - startedAt)} ms to schedule`);
        } catch (error) { fail(error); }
      };
      if (context.state === "running") start();
      else {
        recordDiagnostic(`${label}: waiting for audio engine (${context.state})`);
        void context.resume().then(start, fail);
      }
    });
  }

  unlock() {
    if (!this.broken && !this.disposed && this.context.state !== "running" && this.context.state !== "closed") {
      void this.context.resume().catch(error => recordDiagnostic(`Audio unlock failed: ${String(error)}`));
    }
  }

  stop() {
    this.request++;
    if (this.monitor) clearInterval(this.monitor);
    this.monitor = null;
    if (this.source) { this.source.onended = null; this.source.stop(); this.source.disconnect(); recordDiagnostic(`${this.soundLabel}: stopped`); }
    this.source = null;
    this.cancel?.();
    this.cancel = null;
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.context.onstatechange = null;
    void this.context.close().catch(() => {});
  }
}
