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
        // A compressor warms the mix + tames clipping when a big battle stacks
        // many sounds at once.
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 18;
        comp.ratio.value = 4;
        comp.attack.value = 0.003;
        comp.release.value = 0.2;
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
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

  attack(ranged: boolean, heavy = false): void {
    if (heavy) this.siegeThud();
    else if (ranged) this.whoosh();
    else this.clang();
  }

  /** Deep wooden counterweight release — the catapult's lob. */
  siegeThud(): void {
    if (!this.gate("siege", 120)) return;
    this.tone({ freq: 150, type: "sawtooth", dur: 0.22, gain: 0.5, slideTo: 60 });
    this.noise({ dur: 0.18, gain: 0.4, filter: 500, sweepTo: 200 });
  }

  clang(): void {
    if (!this.gate("clang", 45)) return;
    // Meatier melee hit: a low body thud + detuned metallic blips + a noise tick,
    // all pitch-varied per swing so a brawl doesn't machine-gun one note.
    const v = this.vary(1, 0.08);
    this.tone({ freq: 130 * v, type: "sawtooth", dur: 0.07, gain: 0.32, slideTo: 70 }); // flesh/impact body
    this.tone({ freq: 440 * v, type: "square", dur: 0.08, gain: 0.42, slideTo: 360 });
    this.tone({ freq: 620 * v, type: "square", dur: 0.06, gain: 0.26, slideTo: 500 });
    this.noise({ dur: 0.05, gain: 0.4, filter: 3000 });
  }

  whoosh(): void {
    if (!this.gate("whoosh", 55)) return;
    // Bow release: a short string "twang" + an airy arrow swish.
    const v = this.vary(1, 0.1);
    this.tone({ freq: 320 * v, type: "triangle", dur: 0.07, gain: 0.22, slideTo: 180 });
    this.noise({ dur: 0.16, gain: 0.32, filter: 1700 * v, sweepTo: 500 });
  }

  death(): void {
    if (!this.gate("death", 50)) return;
    const v = this.vary(1, 0.12);
    this.tone({ freq: 300 * v, type: "sawtooth", dur: 0.3, gain: 0.45, slideTo: 70 });
    this.noise({ dur: 0.14, gain: 0.26, filter: 800 });
  }

  /** Fireball / dragon breath: a roaring whoosh into a crackling boom. */
  spellFire(): void {
    if (!this.gate("spellFire", 90)) return;
    this.noise({ dur: 0.3, gain: 0.45, filter: 900, sweepTo: 220 });
    this.tone({ freq: 180, type: "sawtooth", dur: 0.32, gain: 0.4, slideTo: 60 });
    this.tone({ freq: 90, type: "square", dur: 0.34, gain: 0.3, slideTo: 45, delay: 0.04 });
  }

  /** Freeze nova: a glassy shimmer descending into a cold ring. */
  spellFrost(): void {
    if (!this.gate("spellFrost", 90)) return;
    this.tone({ freq: 1400, type: "triangle", dur: 0.3, gain: 0.3, slideTo: 500 });
    this.tone({ freq: 2100, type: "sine", dur: 0.26, gain: 0.18, slideTo: 900, delay: 0.03 });
    this.noise({ dur: 0.32, gain: 0.18, filter: 5000, sweepTo: 2500 });
  }

  /** A small fiery bolt leaving the dragon's maw. */
  firebolt(): void {
    if (!this.gate("firebolt", 70)) return;
    const v = this.vary(1, 0.08);
    this.noise({ dur: 0.14, gain: 0.3, filter: 1200 * v, sweepTo: 500 });
    this.tone({ freq: 240 * v, type: "sawtooth", dur: 0.14, gain: 0.22, slideTo: 120 });
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

  /** Soft blip when the player selects their own units — a crisp acknowledgement. */
  select(): void {
    if (!this.gate("select", 60)) return;
    this.tone({ freq: 520, type: "triangle", dur: 0.05, gain: 0.16 });
  }

  /** Soft two-note "unit ready" chime when a trained unit emerges. */
  ready(): void {
    if (!this.gate("ready", 90)) return;
    this.tone({ freq: 700, type: "triangle", dur: 0.07, gain: 0.22 });
    this.tone({ freq: 940, type: "triangle", dur: 0.1, gain: 0.22, delay: 0.06 });
  }

  /** Triumphant rising chord on victory. */
  victory(): void {
    if (!this.gate("end", 2000)) return;
    this.tone({ freq: 523, type: "triangle", dur: 0.18, gain: 0.5 });
    this.tone({ freq: 659, type: "triangle", dur: 0.18, gain: 0.5, delay: 0.16 });
    this.tone({ freq: 784, type: "triangle", dur: 0.28, gain: 0.5, delay: 0.32 });
    this.tone({ freq: 1047, type: "triangle", dur: 0.5, gain: 0.5, delay: 0.5 });
  }

  /** Somber descending dirge on defeat. */
  defeat(): void {
    if (!this.gate("end", 2000)) return;
    this.tone({ freq: 330, type: "sawtooth", dur: 0.3, gain: 0.45, slideTo: 300 });
    this.tone({ freq: 262, type: "sawtooth", dur: 0.35, gain: 0.45, delay: 0.3, slideTo: 240 });
    this.tone({ freq: 196, type: "sawtooth", dur: 0.7, gain: 0.45, delay: 0.62, slideTo: 150 });
  }

  /** Low rumble + debris for a building collapse. */
  collapse(): void {
    if (!this.gate("collapse", 120)) return;
    this.tone({ freq: 110, type: "sawtooth", dur: 0.4, gain: 0.5, slideTo: 50 });
    this.noise({ dur: 0.45, gain: 0.4, filter: 600 });
  }

  /** Ominous low two-tone "under attack" warning. */
  alert(): void {
    if (!this.gate("alert", 800)) return;
    this.tone({ freq: 220, type: "sawtooth", dur: 0.22, gain: 0.4 });
    this.tone({ freq: 165, type: "sawtooth", dur: 0.3, gain: 0.4, delay: 0.18 });
  }

  // --- Synthesis helpers --------------------------------------------------

  /** Random multiplier in [n-amt, n+amt] for per-call pitch variation. */
  private vary(n: number, amt: number): number {
    return n * (1 + (Math.random() * 2 - 1) * amt);
  }

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
