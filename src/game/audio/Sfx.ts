// Procedurally synthesized sound effects via the Web Audio API — no audio files.
// Everything is generated from oscillators + noise with short envelopes. The
// AudioContext is created lazily and resumed on the first user gesture (browsers
// block audio until then). All calls are wrapped so audio never breaks the game.

const STORAGE_KEY = "warlords.muted.v1";
const MUSIC_KEY = "warlords.music.v1";

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;
  private lastPlay: Record<string, number> = {};

  // --- Procedural music (original gothic ambience) ---
  musicEnabled = true;
  private musicGain: GainNode | null = null;
  private musicTimer: ReturnType<typeof setTimeout> | null = null;
  private chordIdx = 0;
  private barCount = 0;
  private readonly BAR = 5.5; // seconds per chord
  // A slow D-minor lament: Dm – Bb – F – C (i – VI – III – VII), with bass roots.
  private readonly CHORDS = [
    [293.66, 349.23, 440.0], // Dm: D4 F4 A4
    [233.08, 293.66, 349.23], // Bb: Bb3 D4 F4
    [174.61, 220.0, 261.63], // F:  F3 A3 C4
    [261.63, 329.63, 392.0], // C:  C4 E4 G4
  ];
  private readonly BASS = [73.42, 58.27, 87.31, 65.41]; // D2 Bb1 F2 C2

  constructor() {
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === "1";
      this.musicEnabled = localStorage.getItem(MUSIC_KEY) !== "0";
    } catch {
      /* storage blocked — default unmuted, music on */
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
        // Music bus sits under the SFX, through the same compressor.
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.5;
        this.musicGain.connect(this.master);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      if (this.musicEnabled) this.startMusic();
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

  // --- Music --------------------------------------------------------------

  setMusicEnabled(on: boolean): void {
    this.musicEnabled = on;
    try {
      localStorage.setItem(MUSIC_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (on) this.startMusic();
    else this.stopMusic();
  }

  toggleMusic(): void {
    this.setMusicEnabled(!this.musicEnabled);
  }

  private startMusic(): void {
    if (this.musicTimer || !this.ctx || !this.musicGain) return;
    const tick = (): void => {
      this.playBar();
      this.musicTimer = setTimeout(tick, this.BAR * 1000);
    };
    tick();
  }

  private stopMusic(): void {
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** Lay down one chord of the looping progression: bass drone + pad + a bell. */
  private playBar(): void {
    if (!this.ctx || !this.musicGain) return;
    const i = this.chordIdx % this.CHORDS.length;
    this.chordIdx++;
    this.musicNote(this.BASS[i], this.BAR * 0.98, 0.16, "sawtooth"); // low drone
    for (const f of this.CHORDS[i]) this.musicNote(f, this.BAR * 0.94, 0.075, "triangle"); // pad
    // A sparse high bell every other bar for melancholy color.
    if (this.barCount % 2 === 0) {
      const top = this.CHORDS[i][this.CHORDS[i].length - 1] * 2;
      this.musicNote(top, 1.8, 0.05, "sine", this.BAR * 0.45);
    }
    this.barCount++;
  }

  /** A long, soft-swelling musical note routed through the music bus. */
  private musicNote(freq: number, dur: number, gain: number, type: OscillatorType, delay = 0): void {
    const ctx = this.ctx;
    const dest = this.musicGain;
    if (!ctx || !dest) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.35); // slow swell in
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); // fade out
    osc.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
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

  /** Death cry; pitch scales inversely with unit size (small = higher yelp, a
   *  dragon = a low roar). `sizeR` is the unit's body radius (px). */
  death(sizeR = 10): void {
    if (!this.gate("death", 50)) return;
    const v = this.vary(1, 0.12);
    const pitch = Math.max(0.55, Math.min(1.7, 12 / sizeR));
    const dur = sizeR > 14 ? 0.5 : 0.3; // big beasts roar a touch longer
    this.tone({ freq: 300 * v * pitch, type: "sawtooth", dur, gain: 0.45, slideTo: 70 * pitch });
    this.noise({ dur: 0.14, gain: 0.26, filter: 800 * pitch });
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

  /** Resonant four-note chord when a building finishes construction. */
  buildComplete(): void {
    if (!this.gate("buildComplete", 200)) return;
    this.tone({ freq: 392, type: "triangle", dur: 0.5, gain: 0.34 }); // G
    this.tone({ freq: 523, type: "triangle", dur: 0.5, gain: 0.3, delay: 0.04 }); // C
    this.tone({ freq: 659, type: "triangle", dur: 0.55, gain: 0.28, delay: 0.08 }); // E
    this.tone({ freq: 784, type: "sine", dur: 0.6, gain: 0.22, delay: 0.12 }); // G
    this.noise({ dur: 0.18, gain: 0.1, filter: 2200 }); // soft settling dust
  }

  /** Harsh descending screech when a flying beast (griffin/dragon) takes wing. */
  screech(): void {
    if (!this.gate("screech", 250)) return;
    const v = this.vary(1, 0.06);
    this.tone({ freq: 1500 * v, type: "sawtooth", dur: 0.35, gain: 0.26, slideTo: 600 });
    this.tone({ freq: 2200 * v, type: "square", dur: 0.22, gain: 0.12, slideTo: 1100, delay: 0.02 });
    this.noise({ dur: 0.3, gain: 0.14, filter: 3000, sweepTo: 1200 });
  }

  /** Soft muffled footfall/hoof tick when a move order is issued. */
  footfall(): void {
    if (!this.gate("footfall", 70)) return;
    const v = this.vary(1, 0.12);
    this.tone({ freq: 150 * v, type: "sine", dur: 0.08, gain: 0.18, slideTo: 90 });
    this.noise({ dur: 0.07, gain: 0.12, filter: 400 });
  }

  /** Hollow descending thunk when a resource node (mine/forest) runs dry. */
  depleted(): void {
    if (!this.gate("depleted", 150)) return;
    this.tone({ freq: 180, type: "sine", dur: 0.28, gain: 0.3, slideTo: 70 });
    this.noise({ dur: 0.2, gain: 0.12, filter: 500 });
  }

  /** Soft descending "can't do that" buzz — not enough resources / supply / prereq. */
  denied(): void {
    if (!this.gate("denied", 220)) return;
    this.tone({ freq: 320, type: "square", dur: 0.09, gain: 0.16, slideTo: 200 });
    this.tone({ freq: 240, type: "square", dur: 0.12, gain: 0.14, slideTo: 150, delay: 0.08 });
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
