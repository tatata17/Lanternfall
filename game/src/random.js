// A small seeded random generator (mulberry32). The world never calls
// Math.random, so a screenshot scene with a fixed seed is the same frame
// every time it is rendered, and a wave plays out the same for every run
// that starts from the same seed.

export function makeRandom(seed) {
  let state = (seed >>> 0) || 1;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(random, low, high) {
  return low + random() * (high - low);
}

export function pick(random, items) {
  return items[Math.floor(random() * items.length) % items.length];
}
