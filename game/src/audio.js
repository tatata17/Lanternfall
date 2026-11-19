// Lanternfall sound: small WebAudio synth voices, no audio files.
// Nothing plays until the first user gesture (startAudio), which the
// title screen's start action calls. M toggles mute.

let context = null;
let master = null;
let muted = false;

export function startAudio() {
  if (context) {
    if (context.state === 'suspended') context.resume();
    return;
  }
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  context = new AudioCtor();
  master = context.createGain();
  master.gain.value = 0.32;
  master.connect(context.destination);
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.32;
  return muted;
}

export function isMuted() {
  return muted;
}

function tone({ type = 'sine', from = 440, to = null, seconds = 0.12, volume = 0.5, delay = 0 }) {
  if (!context || muted) return;
  const start = context.currentTime + delay;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + seconds);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
  osc.connect(gain);
  gain.connect(master);
  osc.start(start);
  osc.stop(start + seconds + 0.02);
}

function noise({ seconds = 0.15, volume = 0.3, delay = 0, low = 400, high = 2400 }) {
  if (!context || muted) return;
  const start = context.currentTime + delay;
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(high, start);
  filter.frequency.exponentialRampToValueAtTime(low, start + seconds);
  const gain = context.createGain();
  gain.gain.value = volume;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start(start);
}

export const sfx = {
  shoot() { tone({ type: 'square', from: 880, to: 320, seconds: 0.07, volume: 0.16 }); },
  hit() { noise({ seconds: 0.06, volume: 0.18, low: 900, high: 3000 }); },
  kill() { tone({ type: 'triangle', from: 520, to: 90, seconds: 0.22, volume: 0.4 }); noise({ seconds: 0.18, volume: 0.22 }); },
  ember() { tone({ type: 'sine', from: 1180, to: 1760, seconds: 0.09, volume: 0.3 }); },
  pickupPlus() {
    tone({ type: 'triangle', from: 740, seconds: 0.1, volume: 0.32 });
    tone({ type: 'triangle', from: 1108, seconds: 0.16, volume: 0.32, delay: 0.07 });
  },
  pickupMinus() {
    tone({ type: 'sawtooth', from: 300, to: 130, seconds: 0.28, volume: 0.3 });
  },
  blocked() { tone({ type: 'sine', from: 520, to: 700, seconds: 0.08, volume: 0.2 }); },
  heal() {
    tone({ type: 'sine', from: 620, to: 930, seconds: 0.16, volume: 0.3 });
    tone({ type: 'sine', from: 930, to: 1240, seconds: 0.18, volume: 0.24, delay: 0.1 });
  },
  bomb() {
    noise({ seconds: 0.55, volume: 0.55, low: 120, high: 900 });
    tone({ type: 'sine', from: 160, to: 40, seconds: 0.5, volume: 0.5 });
  },
  bonus() {
    tone({ type: 'square', from: 988, seconds: 0.07, volume: 0.16 });
    tone({ type: 'square', from: 1318, seconds: 0.1, volume: 0.16, delay: 0.06 });
  },
  boss() {
    tone({ type: 'sawtooth', from: 92, to: 46, seconds: 0.55, volume: 0.4 });
    noise({ seconds: 0.4, volume: 0.2, low: 100, high: 500 });
  },
  bossdown() {
    noise({ seconds: 0.7, volume: 0.5, low: 120, high: 1000 });
    tone({ type: 'sine', from: 196, to: 392, seconds: 0.4, volume: 0.3, delay: 0.15 });
    tone({ type: 'sine', from: 392, to: 587, seconds: 0.45, volume: 0.26, delay: 0.3 });
  },
  telegraph() { tone({ type: 'square', from: 220, to: 220, seconds: 0.09, volume: 0.14 }); },
  summon() { tone({ type: 'sine', from: 340, to: 220, seconds: 0.16, volume: 0.2 }); },
  teleport() {
    tone({ type: 'sine', from: 1200, to: 300, seconds: 0.14, volume: 0.2 });
    noise({ seconds: 0.12, volume: 0.14, low: 800, high: 2400 });
  },
  shieldup() { tone({ type: 'sine', from: 740, to: 1180, seconds: 0.14, volume: 0.2 }); },
  moth() {
    tone({ type: 'sine', from: 1568, seconds: 0.09, volume: 0.14 });
    tone({ type: 'sine', from: 2093, seconds: 0.12, volume: 0.12, delay: 0.08 });
  },
  downgrade() {
    tone({ type: 'sawtooth', from: 320, to: 90, seconds: 0.35, volume: 0.3 });
    tone({ type: 'sine', from: 160, to: 60, seconds: 0.4, volume: 0.3, delay: 0.05 });
  },
  skip() {
    tone({ type: 'square', from: 784, seconds: 0.08, volume: 0.16 });
    tone({ type: 'square', from: 988, seconds: 0.08, volume: 0.16, delay: 0.07 });
    tone({ type: 'square', from: 1318, seconds: 0.14, volume: 0.18, delay: 0.14 });
  },
  hurt() { tone({ type: 'sawtooth', from: 210, to: 70, seconds: 0.25, volume: 0.42 }); },
  spit() { tone({ type: 'sine', from: 340, to: 180, seconds: 0.1, volume: 0.14 }); },
  waveClear() {
    tone({ type: 'triangle', from: 523, seconds: 0.14, volume: 0.3 });
    tone({ type: 'triangle', from: 659, seconds: 0.14, volume: 0.3, delay: 0.1 });
    tone({ type: 'triangle', from: 784, seconds: 0.24, volume: 0.34, delay: 0.2 });
  },
  upgrade() {
    tone({ type: 'sine', from: 660, seconds: 0.12, volume: 0.3 });
    tone({ type: 'sine', from: 990, seconds: 0.2, volume: 0.3, delay: 0.09 });
  },
  gameOver() {
    tone({ type: 'triangle', from: 392, seconds: 0.3, volume: 0.36 });
    tone({ type: 'triangle', from: 311, seconds: 0.3, volume: 0.36, delay: 0.26 });
    tone({ type: 'triangle', from: 233, seconds: 0.6, volume: 0.4, delay: 0.52 });
  },
  start() {
    tone({ type: 'sine', from: 440, seconds: 0.1, volume: 0.26 });
    tone({ type: 'sine', from: 660, seconds: 0.18, volume: 0.26, delay: 0.08 });
  },
};
