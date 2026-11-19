// Lanternfall: every balance number in one place, so tuning touches one file.
// The arena is a fixed logical field; render.js scales it to the canvas.

// The field's shape. On a touch phone held upright, main.js swaps
// these two numbers at load (800x1280) so the arena itself stands
// tall and fills the phone instead of shrinking to a letterbox strip
// — same area, same rules, rotated proportions. Everything reads
// FIELD at run time, so the swap is the only change needed.
export const FIELD = { width: 1280, height: 800 };

export const STEP = 1 / 60;

export const PLAYER = {
  radius: 16,
  speed: 265,
  maxHp: 100,
  hurtCooldown: 0.55,
};

export const LANTERN = {
  maxFuel: 100,
  startFuel: 82,
  // The burn is set so an untended lantern, lit at 82, gutters out in
  // about 75 seconds: darkness is the pressure, and darkness alone
  // does not kill — it blinds. What kills is what moves in it.
  drainPerSecond: 1.1,
  // The dark deepens as the keeper descends: the standing drain grows
  // by this share of itself every wave.
  drainWaveGrowth: 0.04,
  radiusAtFull: 375,
  radiusAtEmpty: 84,
};

export const BOLT = {
  speed: 640,
  radius: 5,
  life: 0.9,
  baseDamage: 34,
  baseCooldown: 0.24,
};

export const EMBER = {
  life: 14,
};

// Fallen light comes in three sizes, and they gather differently: a
// small ember must be walked over — it never stirs toward the keeper.
// A middling one drifts in from a short way off. A great one crosses
// the dark to reach the lantern, as embers always used to.
export const EMBER_KINDS = {
  small: { fuel: 3, score: 15, radius: 6, magnetRadius: 0, magnetSpeed: 0, glow: 13 },
  medium: { fuel: 6, score: 25, radius: 8, magnetRadius: 72, magnetSpeed: 340, glow: 18 },
  large: { fuel: 12, score: 50, radius: 11, magnetRadius: 120, magnetSpeed: 380, glow: 26 },
};

export const ENEMY_KINDS = {
  shade: { radius: 17, hp: 34, speed: 92, damage: 12, score: 40, embers: 1, emberChance: 1, emberSizes: [0.7, 0.3, 0] },
  dart: { radius: 12, hp: 18, speed: 178, damage: 8, score: 60, embers: 1, emberChance: 0.6, emberSizes: [0.8, 0.2, 0] },
  brute: { radius: 30, hp: 150, speed: 46, damage: 22, score: 150, embers: 3, emberChance: 1, emberSizes: [0.4, 0.4, 0.2] },
  spitter: { radius: 15, hp: 26, speed: 64, damage: 10, score: 80, embers: 2, emberChance: 1, emberSizes: [0.55, 0.35, 0.1] },
};

export const SPIT = { speed: 250, radius: 6, life: 2.6 };

export const WAVES = {
  baseCount: 5,
  countPerWave: 3,
  spawnInterval: 0.85,
  restSeconds: 2.4,
};

// Timed pickups that appear during a wave: blessings worth detouring
// for, hexes that punish a careless path. Every effect lasts the same
// 15 seconds, so a glance at the chip row tells the whole story.
export const ITEMS = {
  seconds: 15,
  life: 13,
  firstAt: 7,
  intervalMin: 9,
  intervalMax: 13,
  minPlayerDist: 240,
  maxPlayerDist: 620,
  radius: 15,
};

export const ITEM_KINDS = {
  rapid: { name: 'Quickstar', polarity: 'plus', color: '#ffd94d', blurb: 'Fire faster' },
  sun: { name: 'Sun Ember', polarity: 'plus', color: '#ff9a3c', blurb: 'Wider light, +fuel' },
  fleet: { name: 'Fleet Feather', polarity: 'plus', color: '#6be8ff', blurb: 'Move faster' },
  aegis: { name: 'Aegis Ward', polarity: 'plus', color: '#7fb2ff', blurb: 'No damage' },
  mend: { name: 'Mend Tonic', polarity: 'plus', stock: true, color: '#6bff8a', blurb: 'Stock it: heal 40 (H)' },
  bomb: { name: 'Dawn Bomb', polarity: 'plus', stock: true, color: '#fff3c4', blurb: 'Stock it: clear the field (B)' },
  heavy: { name: 'Lead Boots', polarity: 'minus', color: '#aeb4c8', blurb: 'Move slower' },
  dim: { name: 'Soot Hex', polarity: 'minus', color: '#b48aff', blurb: 'Light shrinks' },
  jam: { name: 'Jam Hex', polarity: 'minus', color: '#ff6be0', blurb: 'Fire slower' },
};

// The two stocked finds are rare on purpose: most spawns are the timed
// kind, and a stocked one only appears while there is room to hold it.
export const STOCK = {
  mendHeal: 40,
  mendMax: 2,
  bombMax: 1,
  mendChance: 0.07,
  bombChance: 0.035,
};

// Consecutive hits pay a bonus every STREAK.bonusEvery, judged per
// volley: a shot that hits with any of its bolts keeps the streak, and
// only a volley that hits nothing at all resets it.
export const STREAK = { bonusEvery: 8, bonusPoints: 100 };

// Every tenth wave is a boss, cycling through these eight in order and
// then repeating, harder. Each has its own shape and attack pattern.
export const BOSS_ORDER = ['whale', 'weaver', 'mirror', 'bull', 'choir', 'thorn', 'wyrm', 'king'];
export const BOSS_KINDS = {
  whale: { name: 'Gloomwhale', hp: 1350, radius: 54, speed: 62, damage: 24, score: 1500, color: '#5a7bff' },
  weaver: { name: 'Hexweaver', hp: 1150, radius: 44, speed: 88, damage: 16, score: 1500, color: '#c86bff' },
  mirror: { name: 'Mirror Saint', hp: 1250, radius: 40, speed: 74, damage: 16, score: 1600, color: '#bfe8ff' },
  bull: { name: 'Cinder Bull', hp: 1450, radius: 48, speed: 70, damage: 26, score: 1600, color: '#ff7a4d' },
  choir: { name: 'Hollow Choir', hp: 1300, radius: 42, speed: 82, damage: 16, score: 1700, color: '#8affd1' },
  thorn: { name: 'Thornmother', hp: 1550, radius: 50, speed: 40, damage: 18, score: 1700, color: '#9fe870' },
  wyrm: { name: 'Duskwyrm', hp: 1300, radius: 34, speed: 196, damage: 18, score: 1800, color: '#ffb84d' },
  king: { name: 'The Pale King', hp: 1650, radius: 44, speed: 66, damage: 20, score: 2000, color: '#f2ead8' },
};
export const BOSS = { every: 10, cycleHpBonus: 0.75 };

// Beating a boss turns the world: the next stretch wears a new palette
// (background, grid, shade colours, the lantern's glow). Item and
// warning colours never change, so the game stays readable.
export const THEMES = [
  { name: 'First Night', floor: '#1b2440', bg: '#05070f', grid: 'rgba(70, 90, 140, 0.16)', shade: '#5a6ea8', dart: '#3f9db8', spitter: '#4da864', brute: '#7a4db0', eye: '#ffd9d9', glowRgb: '255, 217, 138' },
  { name: 'Ember Dusk', floor: '#33150c', bg: '#120604', grid: 'rgba(160, 80, 40, 0.18)', shade: '#b05a3d', dart: '#d18a2e', spitter: '#b0483d', brute: '#8a3050', eye: '#ffe1b0', glowRgb: '255, 179, 122' },
  { name: 'Verdant Deep', floor: '#0c2b1a', bg: '#03100a', grid: 'rgba(50, 130, 90, 0.16)', shade: '#2e9d6e', dart: '#3fb08a', spitter: '#63b83d', brute: '#2e7a9d', eye: '#d9ffe9', glowRgb: '168, 255, 201' },
  { name: 'Violet Void', floor: '#241040', bg: '#0d0416', grid: 'rgba(130, 70, 180, 0.18)', shade: '#8a4dd1', dart: '#c14db0', spitter: '#6e4dd1', brute: '#a82e63', eye: '#f3d9ff', glowRgb: '224, 168, 255' },
  { name: 'Frost Pale', floor: '#16283a', bg: '#060c12', grid: 'rgba(120, 170, 200, 0.16)', shade: '#5d94b8', dart: '#3fb0c9', spitter: '#6ea8b8', brute: '#5d6eb8', eye: '#e6fbff', glowRgb: '201, 242, 255' },
  { name: 'Golden Hollow', floor: '#2e2008', bg: '#100a02', grid: 'rgba(180, 140, 50, 0.18)', shade: '#c9a83d', dart: '#d1b84d', spitter: '#a8a83d', brute: '#c97a2e', eye: '#fff3c9', glowRgb: '255, 233, 168' },
];

// Clear SKIPPER.flawlessNeeded waves in a row without taking damage
// and a Wayfarer Moth visits the next wave: it enters from a random
// edge, drifts about minding its own business, and leaves after about
// SKIPPER.lifetime seconds. Catch it to jump ahead minSkip..maxSkip
// waves. It is never handed over easily.
export const SKIPPER = { flawlessNeeded: 5, lifetime: 15, minSkip: 5, maxSkip: 10 };

// Blessings are levelled and capped: the keeper's build is the sum of
// the levels taken, a blessing at its max stops being offered, and
// the choice screen shows every level. `heart` is instant — it heals
// on the spot and has no level. `tank` also refills 25 on the spot;
// that part is handled where the choice is applied, not in apply().
export const UPGRADES = [
  { id: 'rapid', name: 'Quickwick', stat: 'Fire rate', max: 5, text: 'Fire 18% faster', apply: (u) => { u.fireRate *= 0.82; } },
  { id: 'power', name: 'Brightshot', stat: 'Damage', max: 5, text: '+35% bolt damage', apply: (u) => { u.damage *= 1.35; } },
  { id: 'twin', name: 'Twin Flame', stat: 'Bolts', max: 3, text: '+1 bolt per shot', apply: (u) => { u.bolts += 1; } },
  { id: 'swift', name: 'Swift Boots', stat: 'Speed', max: 4, text: '+14% move speed', apply: (u) => { u.speed *= 1.14; } },
  { id: 'tank', name: 'Big Reservoir', stat: 'Fuel tank', max: 4, text: '+25 max fuel, refill 25', apply: (u) => { u.maxFuelBonus += 25; } },
  { id: 'sipper', name: 'Slow Burn', stat: 'Burn rate', max: 3, text: 'Lantern drains 20% slower', apply: (u) => { u.drain *= 0.8; } },
  { id: 'magnet', name: 'Ember Charm', stat: 'Ember pull', max: 3, text: 'Embers fly to you from farther', apply: (u) => { u.magnet += 70; } },
  { id: 'heart', name: 'Second Wind', stat: 'Heal', instant: true, text: 'Heal 40 HP now', apply: () => {} },
  { id: 'glass', name: 'Wide Glass', stat: 'Light size', max: 3, text: '+45 lantern light radius', apply: (u) => { u.bonusRadius += 45; } },
];

// Offered to fill a choice when nearly everything is maxed: always
// useful, never levelled.
export const SPOILS = { id: 'spoils', name: 'Spoils of the Deep', text: '+300 score, here and now', instant: true, apply: () => {} };
export const SPOILS_POINTS = 300;

// Getting hurt has a price beyond the wound: PENALTY.hits damaging
// hits inside PENALTY.windowSeconds cost one level of a random
// levelled blessing (health itself is never taken). Telegraphed in
// the HUD from the second hit on.
export const PENALTY = { hits: 3, windowSeconds: 30 };
