// Synthesized sound effects and music, so there are no audio files to load.
// iPad Safari only plays audio after a touch, so the start button calls unlockAudio.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function setMuted(on: boolean) {
  muted = on;
  if (master && ctx) master.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, 0.05);
}

function tone(type: OscillatorType, from: number, to: number, dur: number, vol = 0.2, delay = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, type: BiquadFilterType, from: number, to = from) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start();
}

const arpeggio = (notes: number[], step: number, dur: number, vol = 0.16) =>
  notes.forEach((f, i) => tone("triangle", f, f, dur, vol, i * step));

export const sfx = {
  fire: () => { noise(0.5, 0.35, "lowpass", 2000, 300); tone("sawtooth", 300, 80, 0.35, 0.08); },
  ice: () => { tone("sine", 1400, 2200, 0.3, 0.12); tone("sine", 1800, 2600, 0.3, 0.08, 0.08); tone("sine", 2400, 3200, 0.25, 0.06, 0.16); },
  lightning: () => { noise(0.25, 0.5, "highpass", 3000, 800); tone("square", 140, 40, 0.3, 0.12); },
  shield: () => { tone("triangle", 300, 700, 0.35, 0.18); tone("sine", 600, 1400, 0.35, 0.08); },
  strong: () => arpeggio([523, 659, 784], 0.08, 0.18),
  weak: () => tone("triangle", 300, 250, 0.15, 0.12),
  block: () => { tone("sine", 900, 900, 0.4, 0.18); tone("sine", 1350, 1350, 0.4, 0.08); },
  hurt: () => tone("square", 220, 110, 0.25, 0.1),
  roar: () => { noise(0.9, 0.3, "bandpass", 300, 120); tone("sawtooth", 110, 55, 0.9, 0.1); },
  growl: () => { noise(0.6, 0.18, "lowpass", 400, 150); tone("sawtooth", 90, 60, 0.6, 0.07); },
  friend: () => arpeggio([523, 659, 784, 1047, 1319], 0.11, 0.3, 0.18),
  celebrate: () => arpeggio([523, 659, 784, 1047, 784, 1047, 1319, 1568], 0.1, 0.35, 0.18),
  tap: () => tone("sine", 600, 800, 0.08, 0.07),
  portal: () => { noise(0.8, 0.2, "bandpass", 400, 3000); tone("sine", 200, 900, 0.8, 0.1); },
  locked: () => { tone("square", 200, 200, 0.08, 0.08); tone("square", 160, 160, 0.12, 0.08, 0.1); },
  whoosh: () => noise(0.7, 0.3, "bandpass", 200, 1500),
  star: () => arpeggio([1047, 1319, 1568, 2093], 0.05, 0.2, 0.12),
};

// Gentle background music: a wandering pentatonic tune over a slow four-chord bass.
const SCALE = [392, 440, 523, 587, 659, 784, 880];
const BASS = [131, 110, 87, 98];
let musicTimer = 0;
let step = 0;
let note = 2;
let battle = false;

export function startMusic() {
  if (musicTimer) return;
  const tick = () => {
    if (step % 8 === 0) tone("triangle", BASS[(step / 8) % 4], BASS[(step / 8) % 4], 3, 0.07);
    if (Math.random() < 0.7) {
      note = Math.max(0, Math.min(SCALE.length - 1, note + Math.floor(Math.random() * 3) - 1));
      tone("sine", SCALE[note], SCALE[note], 0.7, 0.045);
    }
    if (battle && step % 2 === 0) noise(0.08, 0.12, "lowpass", 180);
    step++;
    musicTimer = window.setTimeout(tick, battle ? 280 : 420);
  };
  tick();
}

export function setBattleMusic(on: boolean) {
  battle = on;
}
