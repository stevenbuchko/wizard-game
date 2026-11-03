// Synthesized sound effects, so there are no audio files to load.
// iPad Safari only plays audio after a touch, so the start button calls unlockAudio.

let ctx: AudioContext | null = null;

export function unlockAudio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

function tone(type: OscillatorType, from: number, to: number, dur: number, vol = 0.2, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

function noise(dur: number, vol: number, cutoff: number) {
  if (!ctx) return;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
}

const arpeggio = (notes: number[], step: number, dur: number) =>
  notes.forEach((f, i) => tone("triangle", f, f, dur, 0.18, i * step));

export const sfx = {
  fire: () => { noise(0.4, 0.3, 1200); tone("sawtooth", 300, 80, 0.35, 0.1); },
  ice: () => { tone("sine", 1400, 2200, 0.25, 0.15); tone("sine", 1800, 2600, 0.25, 0.1, 0.08); },
  lightning: () => { noise(0.15, 0.4, 5000); tone("square", 120, 40, 0.2, 0.12); },
  shield: () => tone("triangle", 300, 700, 0.3, 0.2),
  strong: () => arpeggio([523, 659, 784], 0.08, 0.15),
  weak: () => tone("triangle", 300, 250, 0.15, 0.12),
  block: () => tone("sine", 900, 900, 0.3, 0.2),
  hurt: () => tone("square", 220, 110, 0.25, 0.1),
  growl: () => { noise(0.6, 0.15, 300); tone("sawtooth", 90, 60, 0.6, 0.08); },
  friend: () => arpeggio([523, 659, 784, 1047], 0.12, 0.25),
  tap: () => tone("sine", 600, 800, 0.08, 0.08),
};
