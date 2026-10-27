import { settings } from './settings';

/**
 * Every sound in the game is synthesised with the Web Audio API: no audio files.
 *
 * Signal chain:
 *   sfx ─────────────────────────────────────────┐
 *   music voices ─┬─────────────────────── musicBus ─ musicFilter ─┤
 *                 ├─ arp ─ delay (feedback) ─┘        reverb ─────┤─ master ─ compressor ─ speakers
 *                 └─ reverb send ─────────────────────────────────┘
 */

export type MusicMode = 'off' | 'menu' | 'game' | 'paused' | 'over';

const BPM = 112;
const STEP = 60 / BPM / 4; // one 16th note
const BAR = STEP * 16;
const LOOKAHEAD = 0.12; // seconds of music scheduled in advance
const TICK_MS = 25;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** A minor: Am7 – Fmaj7 – Dm7 – E7, one chord per bar. Tones sit around middle C. */
const PROGRESSION = [
  { root: 45, tones: [57, 60, 64, 67] },
  { root: 41, tones: [57, 60, 64, 65] },
  { root: 38, tones: [57, 60, 62, 65] },
  { root: 40, tones: [56, 59, 62, 64] },
];
/** Arpeggio over the chord tones; 4+ wraps to the next octave. Played twice per bar. */
const ARP = [0, 1, 2, 3, 4, 3, 2, 1];
/** Bass: 1 = root, 2 = root an octave up, 0 = rest. */
const BASS = [1, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 1, 0, 0, 2, 0];
/** Pentatonic steps for gem chains, so rapid pickups climb a melody instead of a smear. */
const PENTATONIC = [0, 2, 4, 7, 9];

/** How the music bus sounds in each mode. */
const MIX: Record<MusicMode, { gain: number; cutoff: number }> = {
  off: { gain: 0, cutoff: 18000 },
  menu: { gain: 0.55, cutoff: 3200 },
  game: { gain: 0.6, cutoff: 18000 },
  paused: { gain: 0.25, cutoff: 650 },
  over: { gain: 0.4, cutoff: 900 },
};

interface Envelope {
  attack?: number;
  hold?: number;
  release: number;
}

interface FilterSpec {
  type?: BiquadFilterType;
  from: number;
  to?: number;
  q?: number;
}

class AudioEngine {
  private ctx?: AudioContext;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private arpBus!: GainNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;

  private mode: MusicMode = 'off';
  private intensity = 0;
  private step = 0;
  private nextStepTime = 0;

  /** Browsers only allow audio after a user gesture, so the context is created on the first one. */
  init(): void {
    const unlock = () => {
      this.ensureContext();
      if (this.ctx?.state === 'suspended' && !document.hidden) void this.ctx.resume();
    };
    for (const type of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(type, unlock, { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  setMuted(muted: boolean): void {
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  setMusic(mode: MusicMode): void {
    this.mode = mode;
    if (!this.ctx) return;
    const { gain, cutoff } = MIX[mode];
    const now = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(gain, now, 0.25);
    this.musicFilter.frequency.setTargetAtTime(cutoff, now, 0.25);
  }

  /** Layers of the soundtrack build up the longer a run lasts. */
  setIntensity(elapsedSeconds: number): void {
    this.intensity = elapsedSeconds < 15 ? 0 : elapsedSeconds < 45 ? 1 : elapsedSeconds < 90 ? 2 : 3;
  }

  // ─── Sound effects ───────────────────────────────────────────────────────────

  /** Rising power-up sweep with a three-note chime. */
  start(): void {
    const t = this.now();
    if (t === null) return;
    this.tone('sawtooth', 110, t, { release: 0.55 }, 0.16, this.sfx, { glideTo: 880, filter: { from: 300, to: 5000, q: 6 } });
    [81, 88, 93].forEach((note, i) => this.tone('triangle', hz(note), t + 0.12 + i * 0.09, { release: 0.35 }, 0.12, this.sfx));
  }

  /** Gate cleared: an energy zap plus a blast that grows with the number of enemies destroyed. */
  gateBlast(kills: number): void {
    const t = this.now();
    if (t === null) return;
    const size = Math.min(kills, 20) / 20;
    this.tone('square', 1400, t, { release: 0.14 }, 0.08, this.sfx, { glideTo: 180 });
    this.burst(t, 0.45 + size * 0.5, 0.35 + size * 0.35, { from: 4500, to: 120, q: 1 });
    this.tone('sine', 170, t, { release: 0.4 + size * 0.3 }, 0.45 + size * 0.3, this.sfx, { glideTo: 38 });
  }

  /** Gem pickup: a bright blip that climbs a pentatonic scale during a chain. */
  gem(chain: number): void {
    const t = this.now();
    if (t === null) return;
    const step = Math.min(chain, 14);
    const note = 84 + PENTATONIC[step % 5] + 12 * Math.floor(step / 5);
    this.tone('triangle', hz(note), t, { release: 0.16 }, 0.4, this.sfx);
    this.tone('square', hz(note + 12), t, { release: 0.06 }, 0.06, this.sfx, { filter: { from: 5000 } });
  }

  /** The ship explodes: a long roar with a collapsing tone underneath. */
  death(): void {
    const t = this.now();
    if (t === null) return;
    this.burst(t, 1.4, 0.6, { from: 6000, to: 70, q: 0.8 });
    this.tone('sawtooth', 420, t, { release: 1.1 }, 0.22, this.sfx, { glideTo: 30, filter: { from: 2500, to: 200 } });
    this.tone('sine', 95, t, { release: 1.2 }, 0.6, this.sfx, { glideTo: 24 });
  }

  /** Falling minor arpeggio. */
  gameOver(): void {
    const t = this.now();
    if (t === null) return;
    [69, 65, 62, 57].forEach((note, i) =>
      this.tone('triangle', hz(note), t + i * 0.22, { attack: 0.01, release: 0.6 }, 0.16, this.sfx, { filter: { from: 2200 } }),
    );
  }

  /** Rising major fanfare with an echoing top note. */
  highScore(): void {
    const t = this.now();
    if (t === null) return;
    [69, 73, 76, 81].forEach((note, i) =>
      this.tone('square', hz(note), t + i * 0.1, { release: 0.25 }, 0.07, this.sfx, { filter: { from: 3000 } }),
    );
    [81, 85, 88].forEach((note) =>
      this.tone('sawtooth', hz(note), t + 0.42, { attack: 0.02, hold: 0.35, release: 0.7 }, 0.05, this.sfx, {
        filter: { from: 2600 },
        detune: 6,
      }),
    );
  }

  /** Short UI tick for menu choices. */
  select(): void {
    const t = this.now();
    if (t === null) return;
    this.tone('sine', 1320, t, { release: 0.05 }, 0.2, this.sfx);
    this.tone('sine', 1980, t + 0.03, { release: 0.05 }, 0.12, this.sfx);
  }

  // ─── Setup ───────────────────────────────────────────────────────────────────

  private ensureContext(): void {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return; // no audio available; the game plays silently
    }
    this.ctx = ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    compressor.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = settings.muted ? 0 : 1;
    this.master.connect(compressor);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.75;
    this.sfx.connect(this.master);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.musicFilter);

    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(2.8);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.55;
    reverb.connect(reverbReturn).connect(this.musicFilter);
    this.reverbSend = ctx.createGain();
    this.reverbSend.connect(reverb);

    // Dotted-eighth echo on the arpeggio, darkened on every repeat.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const darken = ctx.createBiquadFilter();
    darken.frequency.value = 2400;
    delay.connect(darken).connect(feedback).connect(delay);
    darken.connect(this.musicBus);
    this.arpBus = ctx.createGain();
    this.arpBus.connect(this.musicBus);
    this.arpBus.connect(delay);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.nextStepTime = ctx.currentTime + 0.1;
    this.setMusic(this.mode);
    setInterval(() => this.schedule(), TICK_MS);
  }

  /** Synthetic reverb tail: decaying stereo noise. */
  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
    return buffer;
  }

  /** Current audio time, or null if audio isn't running yet (sound effects are then skipped). */
  private now(): number | null {
    return this.ctx && this.ctx.state === 'running' ? this.ctx.currentTime : null;
  }

  // ─── Synth voices ────────────────────────────────────────────────────────────

  private envelope(param: AudioParam, time: number, peak: number, env: Envelope): number {
    const attack = env.attack ?? 0.004;
    const hold = env.hold ?? 0;
    param.setValueAtTime(0.0001, time);
    param.exponentialRampToValueAtTime(peak, time + attack);
    param.setValueAtTime(peak, time + attack + hold);
    param.exponentialRampToValueAtTime(0.0001, time + attack + hold + env.release);
    return time + attack + hold + env.release;
  }

  private filtered(source: AudioNode, time: number, end: number, spec?: FilterSpec): AudioNode {
    if (!spec) return source;
    const filter = this.ctx!.createBiquadFilter();
    filter.type = spec.type ?? 'lowpass';
    filter.Q.value = spec.q ?? 0.7;
    filter.frequency.setValueAtTime(spec.from, time);
    if (spec.to) filter.frequency.exponentialRampToValueAtTime(spec.to, end);
    source.connect(filter);
    return filter;
  }

  private tone(
    type: OscillatorType,
    freq: number,
    time: number,
    env: Envelope,
    peak: number,
    dest: AudioNode,
    options: { glideTo?: number; filter?: FilterSpec; detune?: number } = {},
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.detune.value = options.detune ?? 0;
    const gain = ctx.createGain();
    const end = this.envelope(gain.gain, time, peak, env);
    osc.frequency.setValueAtTime(freq, time);
    if (options.glideTo) osc.frequency.exponentialRampToValueAtTime(options.glideTo, end);
    this.filtered(osc, time, end, options.filter).connect(gain).connect(dest);
    osc.start(time);
    osc.stop(end + 0.05);
  }

  /** Filtered noise; used for explosions and drums. */
  private burst(time: number, duration: number, peak: number, filter: FilterSpec, dest: AudioNode = this.sfx): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const gain = ctx.createGain();
    const end = this.envelope(gain.gain, time, peak, { release: duration });
    this.filtered(source, time, end, filter).connect(gain).connect(dest);
    source.start(time, Math.random() * 1.5);
    source.stop(end + 0.05);
  }

  // ─── Music sequencer ─────────────────────────────────────────────────────────

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // After a stall (e.g. the tab was hidden) skip ahead rather than playing a burst of missed notes.
    if (this.nextStepTime < ctx.currentTime - 0.05) this.nextStepTime = ctx.currentTime + 0.05;
    while (this.nextStepTime < ctx.currentTime + LOOKAHEAD) {
      if (this.mode !== 'off') this.playStep(this.step, this.nextStepTime);
      this.nextStepTime += STEP;
      this.step = (this.step + 1) % (16 * PROGRESSION.length);
    }
  }

  private playStep(step: number, time: number): void {
    const chord = PROGRESSION[Math.floor(step / 16)];
    const beat = step % 16;
    const mode = this.mode;
    const level = mode === 'menu' || mode === 'over' ? -1 : this.intensity;

    if (beat === 0) this.pad(chord.tones, time);
    if (mode === 'over') return;

    if (mode !== 'menu' || beat % 2 === 0) this.arp(chord.tones, beat, time, level);

    if (mode === 'menu') {
      if (beat === 0) this.bass(chord.root, time, STEP * 12, 0.14);
      return;
    }

    if (BASS[beat]) this.bass(chord.root + (BASS[beat] === 2 ? 12 : 0), time, STEP * 1.6, 0.2);
    const fourOnFloor = level >= 2;
    if (beat % 8 === 0 || (fourOnFloor && beat % 4 === 0)) this.kick(time);
    if (level >= 1 && beat % 8 === 4) this.snare(time);
    if (level >= 1 && beat % 4 === 2) this.hat(time, 0.09);
    if (level >= 3 && beat % 2 === 1) this.hat(time, 0.045);
  }

  /** Slow, detuned saw chord washing into the reverb. */
  private pad(tones: number[], time: number): void {
    for (const note of tones) {
      for (const detune of [-9, 9]) {
        const ctx = this.ctx!;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = hz(note);
        osc.detune.value = detune;
        const gain = ctx.createGain();
        const end = this.envelope(gain.gain, time, 0.022, { attack: 0.7, hold: BAR - 0.9, release: 1.2 });
        const out = this.filtered(osc, time, end, { from: 1100, q: 0.5 }).connect(gain);
        out.connect(this.musicBus);
        out.connect(this.reverbSend);
        osc.start(time);
        osc.stop(end + 0.05);
      }
    }
  }

  private arp(tones: number[], beat: number, time: number, level: number): void {
    const k = ARP[beat % ARP.length];
    const note = tones[k % 4] + 12 * Math.floor(k / 4) + 12;
    const cutoff = 1200 + Math.max(0, level) * 700;
    this.tone('square', hz(note), time, { release: STEP * 0.9 }, 0.045, this.arpBus, { filter: { from: cutoff, q: 3 } });
  }

  private bass(note: number, time: number, length: number, peak: number): void {
    this.tone('sawtooth', hz(note), time, { attack: 0.005, release: length }, peak, this.musicBus, {
      filter: { from: 900, to: 160, q: 4 },
    });
    this.tone('sine', hz(note - 12), time, { attack: 0.005, release: length }, peak * 0.8, this.musicBus);
  }

  private kick(time: number): void {
    this.tone('sine', 150, time, { attack: 0.002, release: 0.28 }, 0.7, this.musicBus, { glideTo: 42 });
  }

  private snare(time: number): void {
    this.burst(time, 0.18, 0.28, { type: 'bandpass', from: 1900, q: 0.9 }, this.musicBus);
    this.tone('triangle', 190, time, { release: 0.1 }, 0.15, this.musicBus);
  }

  private hat(time: number, length: number): void {
    this.burst(time, length, 0.12, { type: 'highpass', from: 7500 }, this.musicBus);
  }
}

export const audio = new AudioEngine();
