/** Efectos de sonido generados con Web Audio API (sin archivos externos). */

type Wave = OscillatorType;

class Sfx {
  private ctx: AudioContext | null = null;
  enabled = true;

  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  private tone(freq: number, dur: number, opts?: { type?: Wave; gain?: number; delay?: number; slideTo?: number }) {
    if (!this.enabled) return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t0 = ctx.currentTime + (opts?.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts?.type ?? "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (opts?.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts?.gain ?? 0.07, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, opts?: { gain?: number; delay?: number; hp?: number }) {
    if (!this.enabled) return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t0 = ctx.currentTime + (opts?.delay ?? 0);
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = opts?.hp ?? 1200;
    const g = ctx.createGain();
    g.gain.value = opts?.gain ?? 0.05;
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t0);
  }

  /** Golpecitos del dado rodando. */
  roll() {
    for (let i = 0; i < 6; i++) this.noise(0.05, { gain: 0.045, delay: i * 0.09, hp: 1800 });
    this.tone(220, 0.08, { type: "triangle", gain: 0.03, delay: 0.55 });
  }

  /** Sacar 1 — tono descendente triste. */
  bust() {
    this.tone(440, 0.18, { type: "sawtooth", gain: 0.05, slideTo: 320 });
    this.tone(320, 0.25, { type: "sawtooth", gain: 0.05, delay: 0.16, slideTo: 180 });
    this.tone(160, 0.4, { type: "sawtooth", gain: 0.05, delay: 0.4, slideTo: 90 });
  }

  /** Asegurar puntos — monedas. */
  coin() {
    this.tone(880, 0.09, { type: "square", gain: 0.035 });
    this.tone(1320, 0.14, { type: "square", gain: 0.035, delay: 0.08 });
  }

  /** Empieza la partida. */
  start() {
    this.tone(330, 0.12, { type: "triangle", gain: 0.05 });
    this.tone(440, 0.12, { type: "triangle", gain: 0.05, delay: 0.12 });
    this.tone(660, 0.2, { type: "triangle", gain: 0.06, delay: 0.24 });
  }

  /** Tambor de tensión (desempate). */
  drum() {
    this.tone(90, 0.3, { type: "sine", gain: 0.12, slideTo: 45 });
    this.noise(0.12, { gain: 0.04, hp: 300 });
  }

  /** Victoria — fanfarria. */
  win() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.18, { type: "triangle", gain: 0.06, delay: i * 0.14 }));
    this.tone(1047, 0.5, { type: "triangle", gain: 0.07, delay: 0.6 });
  }

  /** Alguien se une. */
  pop() {
    this.tone(520, 0.08, { type: "sine", gain: 0.04, slideTo: 780 });
  }

  click() {
    this.tone(600, 0.05, { type: "square", gain: 0.02 });
  }

  /** ¡BONO EXACTO! — arpegio brillante tipo jackpot. */
  jackpot() {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => this.tone(f, 0.14, { type: "triangle", gain: 0.06, delay: i * 0.07 }));
    this.tone(1568, 0.4, { type: "triangle", gain: 0.07, delay: 0.38 });
    this.tone(2093, 0.5, { type: "sine", gain: 0.045, delay: 0.45 });
  }
}

export const sfx = new Sfx();

/**
 * Música de fondo estilo "cazafantasmas" — chiptune generado con Web Audio
 * (bajeo ostinato icónico + gancho melódico, sin archivos ni derechos de terceros).
 */
export class Music {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private master: GainNode | null = null;
  private nextTime = 0;
  private step = 0;
  playing = false;

  private static BPM = 118;
  private static STEP = 60 / Music.BPM / 2; // corchea

  // Riff de bajo estilo cazafantasmas: A A C A D A C A (2 compases)
  private static BASS: (number | null)[] = [
    110, 110, 130.81, 110, 146.83, 110, 130.81, 110,
    110, 110, 130.81, 110, 146.83, 110, 130.81, 110,
  ];
  // Gancho melódico "¿a quién vas a llamar?" en el segundo compás
  private static HOOK: (number | null)[] = [
    null, null, null, null, null, null, null, null,
    523.25, null, 440, null, 392, null, 440, 523.25,
  ];

  private ensureCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  private bassNote(freq: number, t: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Music.STEP * 0.95);
    osc.connect(filter).connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + Music.STEP);
  }

  private hookNote(freq: number, t: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.11, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  private hat(t: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.value = 0.018;
    src.connect(hp).connect(g).connect(this.master!);
    src.start(t);
  }

  private scheduler = () => {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    const ahead = 0.25;
    while (this.nextTime < ctx.currentTime + ahead) {
      const i = this.step % 16;
      const bass = Music.BASS[i];
      if (bass) this.bassNote(bass, this.nextTime);
      const hook = Music.HOOK[i];
      if (hook) this.hookNote(hook, this.nextTime);
      if (i % 4 === 0) this.kick(this.nextTime);
      if (i % 2 === 1) this.hat(this.nextTime);
      this.nextTime += Music.STEP;
      this.step++;
    }
  };

  start() {
    if (this.playing) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
    this.scheduler();
    this.timer = setInterval(this.scheduler, 100);
  }

  stop() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  toggle(): boolean {
    if (this.playing) this.stop();
    else this.start();
    return this.playing;
  }
}

export const music = new Music();
