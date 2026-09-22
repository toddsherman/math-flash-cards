// Keep feedback in memory: no media-element seeking or file decoding on a tap.
export class FeedbackAudio {
  private context: AudioContext;
  private buffers: AudioBuffer[];
  private source: AudioBufferSourceNode | null = null;
  private request = 0;

  constructor() {
    this.context = new AudioContext({ latencyHint: "interactive" });
    this.buffers = [this.makeBuffer(false), this.makeBuffer(true)];
  }

  private makeBuffer(correct: boolean) {
    const rate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, Math.ceil(rate * (correct ? .66 : .32)), rate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate;
      if (correct) {
        for (const [start, frequency] of [[0, 523.25], [.11, 659.25], [.22, 783.99]]) {
          const age = t - start;
          if (age < 0 || age > .4) continue;
          const envelope = Math.min(age / .003, 1) * Math.exp(-age * 11) * Math.min((.4 - age) / .03, 1);
          samples[i] += .23 * envelope * (Math.sin(2 * Math.PI * frequency * age) + .18 * Math.sin(4 * Math.PI * frequency * age));
        }
      } else {
        // A rough, dissonant square-wave buzz with a fast attack and short tail.
        const envelope = Math.min(t / .003, 1, Math.max(0, (.32 - t) / .025));
        const square = (frequency: number) => Math.tanh(5 * Math.sin(2 * Math.PI * frequency * t));
        samples[i] = .23 * envelope * (square(155) + .55 * square(207));
      }
    }
    return buffer;
  }

  play(correct: boolean): Promise<void> {
    this.stop();
    const request = this.request;
    const start = () => {
      if (request !== this.request || this.context.state === "closed") return;
      const source = this.context.createBufferSource();
      source.buffer = this.buffers[correct ? 1 : 0];
      source.connect(this.context.destination);
      source.onended = () => { source.disconnect(); if (this.source === source) this.source = null; };
      this.source = source;
      source.start();
    };
    if (this.context.state === "running") { start(); return Promise.resolve(); }
    // resume is invoked directly from the user gesture, including the first tap.
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
    this.source?.stop();
    this.source = null;
  }

  dispose() { this.stop(); void this.context.close(); }
}
