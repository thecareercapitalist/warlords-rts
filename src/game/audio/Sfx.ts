// Procedurally synthesized sound effects via the Web Audio API — no audio files.
// Everything is generated from oscillators + noise with short envelopes. The
// AudioContext is created lazily and resumed on the first user gesture (browsers
// block audio until then). All calls are wrapped so audio never breaks the game.

const STORAGE_KEY = "warlords.muted.v1";

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;
  private lastPlay: Record<string, number> = {};

  constructor() {
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      /* storage blocked — default unmuted */
    }
  }

  /** Create/resume the context. Call on a user gesture (click/key). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.35;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      /* audio unavailable */
    }
  }

  toggleMute(): void {
    this.setMuted(!this.muted);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
    try {
      localStorage.setItem(STORAGE_KEY, m ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  // --- Public effects -----------------------------------------------------

  attack(ranged: boolean): void {
    if (ranged) this.whoosh();
    else this.clang();
  }

  clang(): void {
    if (!this.gate("clang", 55)) return;
    // Metallic: two detuned square blips + a noise tick.
    this.tone({ freq: 440, type: "square", dur: 0.08, gain: 0.5, slideTo: 360 });
    this.tone({ freq: 620, type: "square", dur: 0.06, gain: 0.3, slideTo: 500 });
    this.noise({ dur: 0.05, gain: 0.4, filter: 3000 });
  }

  whoosh(): void {
    if (!this.gate("whoosh", 70)) return;
    this.noise({ dur: 0.16, gain: 0.35, filter: 1400, sweepTo: 600 });
  }

  death(): void {
    if (!this.gate("death", 60)) return;
    this.tone({ freq: 300, type: "sawtooth", dur: 0.28, gain: 0.45, slideTo: 80 });
    this.noise({ dur: 0.12, gain: 0.25, filter: 800 });
  }

  build(): void {
    if (!this.gate("build", 120)) return;
    // Pleasant rising triad.
    this.tone({ freq: 523, type: "triangle", dur: 0.12, gain: 0.4 });
    this.tone({ freq: 659, type: "triangle", dur: 0.12, gain: 0.4, delay: 0.1 });
    this.tone({ freq: 784, type: "triangle", dur: 0.18, gain: 0.4, delay: 0.2 });
  }

  click(): void {
    if (!this.gate("click", 40)) return;
    this.tone({ freq: 660, type: "square", dur: 0.04, gain: 0.18 });
  }

  /** Ominous low two-tone "under attack" warning. */
  alert(): void {
    if (!this.gate("alert", 800)) return;
    this.tone({ freq: 220, type: "sawtooth", dur: 0.22, gain: 0.4 });
    this.tone({ freq: 165, type: "sawtooth", dur: 0.3, gain: 0.4, delay: 0.18 });
  }

  // --- Synthesis helpers --------------------------------------------------

  /** Rate-limit a given sound so big battles don't machine-gun the speakers. */
  private gate(key: string, gapMs: number): boolean {
    if (this.muted || !this.ctx || !this.master) return false;
    const now = performance.now();
    if ((this.lastPlay[key] ?? -1e9) + gapMs > now) return false;
    this.lastPlay[key] = now;
    return true;
  }

  private tone(o: {
    freq: number;
    type: OscillatorType;
    dur: number;
    gain: number;
    slideTo?: number;
    delay?: number;
  }): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), t0 + o.dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }

  private noise(o: { dur: number; gain: number; filter: number; sweepTo?: number }): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const frames = Math.floor(ctx.sampleRate * o.dur);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(o.filter, t0);
    if (o.sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(1, o.sweepTo), t0 + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + o.dur + 0.02);
  }
}
