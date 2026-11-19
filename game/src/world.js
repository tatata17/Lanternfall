// Lanternfall world: the whole simulation in fixed steps, no rendering
// and no sound in here. Sound cues are queued in world.events as names
// and main.js plays them, which keeps the world deterministic and lets
// the screenshot scenes run it silently.

import { BOLT, BOSS, BOSS_KINDS, BOSS_ORDER, EMBER, EMBER_KINDS, ENEMY_KINDS, FIELD, ITEM_KINDS, ITEMS, LANTERN, PENALTY, PLAYER, SKIPPER, SPIT, SPOILS, SPOILS_POINTS, STOCK, STREAK, UPGRADES, WAVES } from './config.js';
import { makeRandom, range } from './random.js';

export function createWorld(seed) {
  const random = makeRandom(seed);
  const world = {
    random,
    time: 0,
    wave: 0,
    score: 0,
    kills: 0,
    embersCollected: 0,
    phase: 'rest',
    restTimer: 1.2,
    toSpawn: 0,
    spawnTimer: 0,
    choices: [],
    events: [],
    shake: 0,
    player: {
      x: FIELD.width / 2, y: FIELD.height / 2, hp: PLAYER.maxHp,
      fireTimer: 0, hurtTimer: 0, aimAngle: 0,
    },
    lantern: { fuel: LANTERN.startFuel, maxFuel: LANTERN.maxFuel },
    mods: {
      fireRate: 1, damage: 1, bolts: 1, speed: 1, drain: 1,
      magnet: 0, bonusRadius: 0, maxFuelBonus: 0, heal: 0, refill: 0,
    },
    levels: { rapid: 0, power: 0, twin: 0, swift: 0, tank: 0, sipper: 0, magnet: 0, glass: 0 },
    hitTimes: [],
    enemies: [],
    bolts: [],
    spits: [],
    embers: [],
    particles: [],
    floaters: [],
    items: [],
    itemTimer: ITEMS.firstAt,
    effects: { rapid: 0, sun: 0, fleet: 0, aegis: 0, heavy: 0, dim: 0, jam: 0 },
    stock: { mend: 0, bomb: 0 },
    theme: 0,
    bossesBeaten: 0,
    bossName: null,
    noHitWaves: 0,
    waveHurt: false,
    skipper: null,
    skipperPending: false,
    shotsFired: 0,
    shotsHit: 0,
    streak: 0,
    bestStreak: 0,
    volleys: new Map(),
    nextVolley: 1,
    flash: 0,
  };
  return world;
}

export function lightRadius(world) {
  const share = Math.max(0, world.lantern.fuel) / world.lantern.maxFuel;
  const base = LANTERN.radiusAtEmpty + (LANTERN.radiusAtFull - LANTERN.radiusAtEmpty) * share;
  let radius = base + world.mods.bonusRadius + (world.effects.sun > 0 ? 85 : 0);
  if (world.effects.dim > 0) radius *= 0.62;
  return radius;
}

function startWave(world) {
  world.wave += 1;
  world.waveHurt = false;
  world.spawnTimer = 0.4;
  world.phase = 'fighting';
  if (world.wave % BOSS.every === 0) {
    // A boss wave: one great shade, no trickle. What it summons is
    // its own business, and everything it brought dies with it.
    world.toSpawn = 0;
    spawnBoss(world);
  } else {
    world.bossName = null;
    world.toSpawn = WAVES.baseCount + (world.wave - 1) * WAVES.countPerWave;
  }
  if (world.skipperPending && !world.skipper && world.wave % BOSS.every !== 0) {
    world.skipperPending = false;
    spawnSkipper(world);
  }
  world.events.push('wave');
}

/** The boss for this wave: the eight cycle in order, and each full
 * cycle survived makes the next one tougher. */
export function bossKindForWave(wave) {
  const index = Math.floor(wave / BOSS.every) - 1;
  return BOSS_ORDER[((index % BOSS_ORDER.length) + BOSS_ORDER.length) % BOSS_ORDER.length];
}

export function spawnBoss(world, kindKey = null) {
  const kind = kindKey || bossKindForWave(world.wave);
  const base = BOSS_KINDS[kind];
  const cycleIndex = Math.floor((Math.floor(world.wave / BOSS.every) - 1) / BOSS_ORDER.length);
  // The boss sizes the keeper up: its health scales with the build's
  // raw output (damage x bolts / cooldown), so a boss fight lasts
  // about as long for a cannon build as for a utility one, instead
  // of melting in seconds once upgrades stack up.
  const power = (world.mods.damage * world.mods.bolts) / world.mods.fireRate;
  const adapt = 0.4 + 1.1 * power;
  const hpScale = (1 + (world.wave - 1) * 0.07) * (1 + Math.max(0, cycleIndex) * BOSS.cycleHpBonus) * adapt;
  const boss = {
    kind, boss: true, name: base.name,
    x: FIELD.width / 2, y: 130, radius: base.radius,
    hp: base.hp * hpScale, maxHp: base.hp * hpScale,
    speed: base.speed, damage: base.damage, score: base.score,
    spitTimer: 2, wobble: 0, kx: 0, ky: 0,
    atk: 2.2, state: 'roam', stateT: 0, aimX: 0, aimY: 0,
    charges: 0, shield: 0, shieldTimer: 6, angle: 0, spitAngle: 0, trail: [],
  };
  world.enemies.push(boss);
  world.bossName = base.name;
  world.events.push('boss');
  return boss;
}

/** A shade called by a boss, at a chosen spot rather than an edge. */
function spawnMinion(world, kind, x, y) {
  const base = ENEMY_KINDS[kind];
  const hpScale = 1 + (world.wave - 1) * 0.07;
  world.enemies.push({
    kind, x, y, radius: base.radius, hp: base.hp * hpScale, maxHp: base.hp * hpScale,
    speed: base.speed * range(world.random, 0.85, 1.15), damage: base.damage,
    score: base.score, spitTimer: range(world.random, 1.2, 2.4), wobble: range(world.random, 0, 6.28),
    kx: 0, ky: 0,
  });
}

function fireSpit(world, x, y, angle, speed = SPIT.speed) {
  world.spits.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 3.2 });
}

function fireSpitAt(world, enemy, speed = SPIT.speed) {
  const player = world.player;
  fireSpit(world, enemy.x, enemy.y, Math.atan2(player.y - enemy.y, player.x - enemy.x), speed);
}

function fireRing(world, enemy, count, speed, offset = 0) {
  for (let i = 0; i < count; i += 1) {
    fireSpit(world, enemy.x, enemy.y, offset + (i / count) * Math.PI * 2, speed);
  }
}

function minionCount(world) {
  return world.enemies.filter((enemy) => !enemy.boss).length;
}

function kindForWave(world) {
  const wave = world.wave;
  const roll = world.random();
  if (wave >= 4 && roll < 0.1) return 'brute';
  if (wave >= 3 && roll < 0.3) return 'spitter';
  if (wave >= 2 && roll < 0.52) return 'dart';
  return 'shade';
}

function spawnEnemy(world) {
  const kind = kindForWave(world);
  const base = ENEMY_KINDS[kind];
  const side = Math.floor(world.random() * 4);
  let x = 0;
  let y = 0;
  if (side === 0) { x = range(world.random, 40, FIELD.width - 40); y = -30; }
  if (side === 1) { x = range(world.random, 40, FIELD.width - 40); y = FIELD.height + 30; }
  if (side === 2) { x = -30; y = range(world.random, 40, FIELD.height - 40); }
  if (side === 3) { x = FIELD.width + 30; y = range(world.random, 40, FIELD.height - 40); }
  const hpScale = 1 + (world.wave - 1) * 0.07;
  world.enemies.push({
    kind, x, y, radius: base.radius, hp: base.hp * hpScale, maxHp: base.hp * hpScale,
    speed: base.speed * range(world.random, 0.85, 1.15), damage: base.damage,
    score: base.score, spitTimer: range(world.random, 1.2, 2.4), wobble: range(world.random, 0, 6.28),
    kx: 0, ky: 0,
  });
}

function burst(world, x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const angle = world.random() * Math.PI * 2;
    const pace = range(world.random, speed * 0.3, speed);
    world.particles.push({
      x, y, vx: Math.cos(angle) * pace, vy: Math.sin(angle) * pace,
      life: range(world.random, 0.25, 0.6), maxLife: 0.6, color,
      size: range(world.random, 2, 5),
    });
  }
}

function dropEmbers(world, x, y, count, chance = 1, sizeWeights = [0.7, 0.3, 0]) {
  for (let i = 0; i < count; i += 1) {
    // Not every ember survives the fall: each one is rolled on its
    // own, so a dart (chance 0.6) often leaves nothing behind. Each
    // survivor then rolls its size against the weights — small,
    // medium, large — which decides how it gathers (see EMBER_KINDS).
    if (world.random() >= chance) continue;
    const roll = world.random();
    const kind = roll < sizeWeights[0] ? 'small' : roll < sizeWeights[0] + sizeWeights[1] ? 'medium' : 'large';
    world.embers.push({
      x: x + range(world.random, -22, 22), y: y + range(world.random, -22, 22),
      life: EMBER.life, vx: 0, vy: 0, kind,
    });
  }
}

function offerUpgrades(world) {
  // A blessing at its max level is never offered — a choice that
  // cannot improve the build is not a choice. Spoils fill the card
  // row when the build is nearly complete.
  const pool = UPGRADES.filter((u) => u.instant || (world.levels[u.id] || 0) < u.max);
  world.choices = [];
  for (let i = 0; i < 3; i += 1) {
    if (pool.length === 0) { world.choices.push(SPOILS); continue; }
    const index = Math.floor(world.random() * pool.length);
    world.choices.push(pool.splice(index, 1)[0]);
  }
  world.phase = 'upgrade';
  world.events.push('waveClear');
}

/** The build is a function of the levels taken: recompute the mods
 * from scratch whenever a level changes, so gaining and losing
 * levels stay exact mirrors of each other. */
function computeMods(world) {
  const mods = {
    fireRate: 1, damage: 1, bolts: 1, speed: 1, drain: 1,
    magnet: 0, bonusRadius: 0, maxFuelBonus: 0, heal: 0, refill: 0,
  };
  for (const u of UPGRADES) {
    if (u.instant) continue;
    const level = world.levels[u.id] || 0;
    for (let i = 0; i < level; i += 1) u.apply(mods);
  }
  world.mods = mods;
  world.lantern.maxFuel = LANTERN.maxFuel + mods.maxFuelBonus;
  world.lantern.fuel = Math.min(world.lantern.fuel, world.lantern.maxFuel);
}

export function applyUpgrade(world, choice) {
  if (choice.id === 'spoils') {
    world.score += SPOILS_POINTS;
  } else if (choice.id === 'heart') {
    world.player.hp = Math.min(PLAYER.maxHp, world.player.hp + 40);
  } else {
    world.levels[choice.id] = (world.levels[choice.id] || 0) + 1;
    computeMods(world);
    if (choice.id === 'tank') {
      world.lantern.fuel = Math.min(world.lantern.maxFuel, world.lantern.fuel + 25);
    }
  }
  world.choices = [];
  world.events.push('upgrade');
  startWave(world);
}

function fireBolts(world, aim) {
  const player = world.player;
  const count = world.mods.bolts;
  world.shotsFired += count;
  const volley = world.nextVolley;
  world.nextVolley += 1;
  world.volleys.set(volley, { pending: count, hits: 0 });
  for (let i = 0; i < count; i += 1) {
    const spread = (i - (count - 1) / 2) * 0.11;
    const angle = Math.atan2(aim.y - player.y, aim.x - player.x) + spread;
    world.bolts.push({
      x: player.x + Math.cos(angle) * 20, y: player.y + Math.sin(angle) * 20,
      vx: Math.cos(angle) * BOLT.speed, vy: Math.sin(angle) * BOLT.speed,
      life: BOLT.life, damage: BOLT.baseDamage * world.mods.damage, volley,
    });
  }
  const fireFactor = world.mods.fireRate * (world.effects.rapid > 0 ? 0.55 : 1) * (world.effects.jam > 0 ? 1.8 : 1);
  player.fireTimer = BOLT.baseCooldown * fireFactor;
  world.events.push('shoot');
}

function hurtPlayer(world, damage, attacker = null) {
  const player = world.player;
  if (player.hurtTimer > 0 || world.phase === 'over') return;
  if (world.effects.aegis > 0) {
    world.events.push('blocked');
    burst(world, player.x, player.y, '#7fb2ff', 6, 150);
    return;
  }
  // Whatever lands a hit is knocked back out of reach, so a touch can
  // never turn into a shade sitting on the keeper dealing damage on
  // every cooldown tick.
  if (attacker) {
    const dx = attacker.x - player.x;
    const dy = attacker.y - player.y;
    const dist = Math.hypot(dx, dy) || 1;
    attacker.kx += (dx / dist) * 330;
    attacker.ky += (dy / dist) * 330;
  }
  player.hp -= damage;
  world.waveHurt = true;
  player.hurtTimer = PLAYER.hurtCooldown;
  world.shake = Math.min(14, world.shake + 7);
  world.events.push('hurt');
  burst(world, player.x, player.y, '#ff7a5c', 10, 190);
  // The toll: hits inside the window are counted, and the third one
  // costs a blessing level. The count resets either way.
  world.hitTimes.push(world.time);
  world.hitTimes = world.hitTimes.filter((t) => world.time - t <= PENALTY.windowSeconds);
  if (world.hitTimes.length >= PENALTY.hits) {
    world.hitTimes = [];
    takeToll(world);
  }
  if (player.hp <= 0) {
    player.hp = 0;
    world.phase = 'over';
    world.events.push('gameOver');
    burst(world, player.x, player.y, '#ffc46b', 42, 320);
  }
}

/** The dark takes a level of a random blessing the keeper has —
 * never health itself, and nothing when the build is still bare. */
function takeToll(world) {
  const owned = UPGRADES.filter((u) => !u.instant && (world.levels[u.id] || 0) > 0);
  if (owned.length === 0) return;
  const lost = owned[Math.floor(world.random() * owned.length) % owned.length];
  world.levels[lost.id] -= 1;
  computeMods(world);
  world.events.push('downgrade');
  world.floaters.push({
    x: world.player.x, y: world.player.y - 62,
    text: `The dark takes a toll: ${lost.name} Lv${world.levels[lost.id] + 1} → ${world.levels[lost.id]}`,
    life: 1.8,
  });
}

export function stepWorld(world, dt, input) {
  if (world.phase === 'over' || world.phase === 'upgrade') {
    stepParticles(world, dt);
    return;
  }
  world.time += dt;
  const player = world.player;

  // Timed pickup effects count down.
  for (const key of Object.keys(world.effects)) {
    if (world.effects[key] > 0) world.effects[key] = Math.max(0, world.effects[key] - dt);
  }
  // The toll window slides: old hits stop counting.
  if (world.hitTimes.length > 0) {
    world.hitTimes = world.hitTimes.filter((t) => world.time - t <= PENALTY.windowSeconds);
  }

  // The lantern always burns down, and faster the deeper the keeper
  // goes. An empty lantern does not kill — it blinds: the light dies
  // to a coal-glow and the keeper fights by the eyes in the dark
  // until the flame is fed again. The Soot Hex makes it burn faster.
  const drainFactor = world.mods.drain * (world.effects.dim > 0 ? 1.6 : 1) * (1 + (world.wave - 1) * LANTERN.drainWaveGrowth);
  world.lantern.fuel = Math.max(0, world.lantern.fuel - LANTERN.drainPerSecond * drainFactor * dt);

  // Movement and aim. The Fleet Feather and the Lead Boots pull the
  // keeper's pace in opposite directions.
  const speedFactor = world.mods.speed * (world.effects.fleet > 0 ? 1.35 : 1) * (world.effects.heavy > 0 ? 0.74 : 1);
  player.x = Math.min(FIELD.width - 24, Math.max(24, player.x + input.move.x * PLAYER.speed * speedFactor * dt));
  player.y = Math.min(FIELD.height - 24, Math.max(24, player.y + input.move.y * PLAYER.speed * speedFactor * dt));
  player.aimAngle = Math.atan2(input.aim.y - player.y, input.aim.x - player.x);
  player.hurtTimer = Math.max(0, player.hurtTimer - dt);

  // Firing.
  player.fireTimer -= dt;
  if (input.firing && player.fireTimer <= 0) fireBolts(world, input.aim);

  // Wave flow.
  if (world.phase === 'rest') {
    world.restTimer -= dt;
    if (world.restTimer <= 0) {
      if (world.wave === 0) startWave(world);
      else offerUpgrades(world);
    }
  }
  if (world.phase === 'fighting') {
    if (world.toSpawn > 0) {
      world.spawnTimer -= dt;
      if (world.spawnTimer <= 0) { spawnEnemy(world); world.toSpawn -= 1; world.spawnTimer = WAVES.spawnInterval; }
    } else if (world.enemies.length === 0) {
      // The wave is clear, and clearing pays the wave's number times
      // ten: the deeper the run, the richer each wave is worth, which
      // is what makes pressing on — or leaping ahead — pay.
      const clearBonus = world.wave * 10;
      world.score += clearBonus;
      world.floaters.push({ x: world.player.x, y: world.player.y - 58, text: `Wave ${world.wave} clear +${clearBonus}`, life: 1.3 });
      // A wave survived untouched feeds the flawless run that
      // eventually draws the Wayfarer Moth.
      if (world.waveHurt) world.noHitWaves = 0;
      else {
        world.noHitWaves += 1;
        if (world.noHitWaves >= SKIPPER.flawlessNeeded) world.skipperPending = true;
      }
      world.phase = 'rest';
      world.restTimer = WAVES.restSeconds;
    }
  }

  world.flash = Math.max(0, world.flash - dt);
  stepBolts(world, dt);
  stepEnemies(world, dt);
  stepSpits(world, dt);
  stepEmbers(world, dt);
  stepItems(world, dt);
  if (world.skipper && world.phase !== 'upgrade') stepSkipper(world, dt);
  stepParticles(world, dt);
  world.shake = Math.max(0, world.shake - dt * 26);
}

function stepBolts(world, dt) {
  const kept = [];
  for (const bolt of world.bolts) {
    bolt.x += bolt.vx * dt;
    bolt.y += bolt.vy * dt;
    bolt.life -= dt;
    let spent = bolt.life <= 0 || bolt.x < -20 || bolt.x > FIELD.width + 20 || bolt.y < -20 || bolt.y > FIELD.height + 20;
    let hit = false;
    if (!spent) {
      for (const enemy of world.enemies) {
        const dx = enemy.x - bolt.x;
        const dy = enemy.y - bolt.y;
        if (dx * dx + dy * dy < (enemy.radius + BOLT.radius) ** 2) {
          spent = true;
          hit = true;
          world.shotsHit += 1;
          if (enemy.boss && enemy.shield > 0) {
            // The Mirror Saint turns bolts aside while its shield is
            // up: the hit counts, the damage does not.
            world.events.push('blocked');
            burst(world, bolt.x, bolt.y, '#bfe8ff', 5, 160);
            break;
          }
          enemy.hp -= bolt.damage;
          if (enemy.boss) {
            // A wounded boss sheds light: at three-quarter, half and
            // quarter health it spills embers, so pressing the attack
            // also feeds the lantern through a long fight.
            if (!enemy.shedMarks) enemy.shedMarks = [0.75, 0.5, 0.25];
            while (enemy.shedMarks.length > 0 && enemy.hp <= enemy.maxHp * enemy.shedMarks[0]) {
              enemy.shedMarks.shift();
              dropEmbers(world, enemy.x, enemy.y, 3, 1, [0, 0.6, 0.4]);
            }
          }
          // A hit shoves the shade back: the smaller it is, the farther
          // it flies. Shooting a swarm therefore opens a path through it.
          const shove = enemy.boss ? 8 : enemy.kind === 'brute' ? 46 : enemy.kind === 'dart' ? 300 : 185;
          const pace = Math.hypot(bolt.vx, bolt.vy) || 1;
          enemy.kx += (bolt.vx / pace) * shove;
          enemy.ky += (bolt.vy / pace) * shove;
          world.events.push('hit');
          burst(world, bolt.x, bolt.y, '#ffd98a', 4, 150);
          if (enemy.hp <= 0 && !enemy.dead) {
            enemy.dead = true;
            world.kills += 1;
            world.score += enemy.score;
            world.events.push('kill');
            world.shake = Math.min(12, world.shake + (enemy.kind === 'brute' ? 8 : 3));
            burst(world, enemy.x, enemy.y, enemy.kind === 'brute' ? '#c9a2ff' : '#9fd8ff', enemy.kind === 'brute' ? 26 : 14, 240);
            if (enemy.boss) bossDown(world, enemy);
            else dropEmbers(world, enemy.x, enemy.y, ENEMY_KINDS[enemy.kind].embers, ENEMY_KINDS[enemy.kind].emberChance, ENEMY_KINDS[enemy.kind].emberSizes);
            world.floaters.push({ x: enemy.x, y: enemy.y - 18, text: `+${enemy.score}`, life: 0.9 });
          }
          break;
        }
      }
    }
    if (!spent) kept.push(bolt);
    else settleBolt(world, bolt, hit);
  }
  world.bolts = kept;
  world.enemies = world.enemies.filter((enemy) => !enemy.dead);
}

/** A boss falls: everything it summoned falls with it (score counts,
 * embers do not), it drops a rich spill of embers itself, and the
 * world turns to its next palette. */
function bossDown(world, boss) {
  world.bossesBeaten += 1;
  world.theme += 1;
  world.bossName = null;
  world.events.push('bossdown');
  world.shake = 16;
  world.flash = 0.5;
  burst(world, boss.x, boss.y, BOSS_KINDS[boss.kind].color, 46, 340);
  burst(world, boss.x, boss.y, '#ffffff', 22, 240);
  for (const other of world.enemies) {
    if (other !== boss && !other.dead) {
      other.dead = true;
      world.kills += 1;
      world.score += other.score;
      burst(world, other.x, other.y, '#9fd8ff', 10, 220);
    }
  }
  world.spits = [];
  dropEmbers(world, boss.x, boss.y, 6, 1, [0, 0.5, 0.5]);
  world.floaters.push({ x: boss.x, y: boss.y - 30, text: `${boss.name} falls — the dark changes`, life: 1.8 });
}

/** A bolt is spent, one way or the other. The streak is judged per
 * volley, not per bolt, so a Twin Flame shot whose second bolt strays
 * does not erase a volley that hit: the streak grows by the volley's
 * hits when its last bolt settles, and only a volley that hit nothing
 * at all resets it. Every STREAK.bonusEvery unbroken hits pay out. */
function settleBolt(world, bolt, hit) {
  const volley = world.volleys.get(bolt.volley);
  if (!volley) return;
  volley.pending -= 1;
  if (hit) volley.hits += 1;
  if (volley.pending > 0) return;
  world.volleys.delete(bolt.volley);
  if (volley.hits === 0) { world.streak = 0; return; }
  const before = world.streak;
  world.streak += volley.hits;
  world.bestStreak = Math.max(world.bestStreak, world.streak);
  const crossed = Math.floor(world.streak / STREAK.bonusEvery) - Math.floor(before / STREAK.bonusEvery);
  for (let i = 0; i < crossed; i += 1) {
    world.score += STREAK.bonusPoints;
    world.events.push('bonus');
    world.floaters.push({ x: world.player.x, y: world.player.y - 44, text: `Sharpshooter +${STREAK.bonusPoints}`, life: 1.2 });
  }
}

function stepEnemies(world, dt) {
  const player = world.player;
  for (const enemy of world.enemies) {
    if (enemy.boss) { stepBoss(world, enemy, dt); continue; }
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    let moveX = dx / dist;
    let moveY = dy / dist;
    if (enemy.kind === 'spitter') {
      if (dist < 230) { moveX = -moveX; moveY = -moveY; }
      else if (dist < 300) { moveX = -dy / dist; moveY = dx / dist; }
      enemy.spitTimer -= dt;
      if (enemy.spitTimer <= 0 && dist < 430) {
        enemy.spitTimer = 2.2;
        world.spits.push({ x: enemy.x, y: enemy.y, vx: (dx / dist) * SPIT.speed, vy: (dy / dist) * SPIT.speed, life: SPIT.life });
        world.events.push('spit');
      }
    }
    const wobble = Math.sin(world.time * 3 + enemy.wobble) * 0.25;
    const wx = moveX * Math.cos(wobble) - moveY * Math.sin(wobble);
    const wy = moveX * Math.sin(wobble) + moveY * Math.cos(wobble);
    enemy.x += wx * enemy.speed * dt + enemy.kx * dt;
    enemy.y += wy * enemy.speed * dt + enemy.ky * dt;
    const decay = Math.max(0, 1 - 7 * dt);
    enemy.kx *= decay;
    enemy.ky *= decay;
    if (dist < enemy.radius + PLAYER.radius) hurtPlayer(world, enemy.damage, enemy);
  }
  separateEnemies(world);
}

/** One boss, one pattern. All eight share the same chassis — knockback
 * drift, contact damage — and differ in how they move and attack:
 * chargers (whale, bull), a summoner (weaver), a shielded radial
 * turret (mirror), a spiral orbiter (choir), a ring-burst anchor
 * (thorn), a fast serpent (wyrm), and a teleporter (king). */
function stepBoss(world, enemy, dt) {
  const player = world.player;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  enemy.shield = Math.max(0, enemy.shield - dt);
  let vx = 0;
  let vy = 0;

  if (enemy.kind === 'whale' || enemy.kind === 'bull') {
    const triple = enemy.kind === 'bull';
    if (enemy.state === 'roam') {
      vx = ux * enemy.speed; vy = uy * enemy.speed;
      enemy.atk -= dt;
      if (enemy.atk <= 0) {
        enemy.state = 'telegraph';
        enemy.stateT = triple ? 0.5 : 0.8;
        enemy.aimX = ux; enemy.aimY = uy;
        enemy.charges = triple ? 3 : 1;
        world.events.push('telegraph');
      }
    } else if (enemy.state === 'telegraph') {
      enemy.stateT -= dt;
      if (enemy.stateT <= 0) { enemy.state = 'charge'; enemy.stateT = triple ? 0.45 : 0.65; }
    } else if (enemy.state === 'charge') {
      const pace = triple ? 640 : 560;
      vx = enemy.aimX * pace; vy = enemy.aimY * pace;
      enemy.stateT -= dt;
      if (enemy.stateT <= 0) {
        enemy.charges -= 1;
        if (enemy.charges > 0) {
          enemy.state = 'telegraph';
          enemy.stateT = 0.35;
          enemy.aimX = ux; enemy.aimY = uy;
          world.events.push('telegraph');
        } else { enemy.state = 'roam'; enemy.atk = triple ? 3.0 : 3.6; }
      }
    }
  } else if (enemy.kind === 'weaver') {
    if (dist > 350) { vx = ux * enemy.speed; vy = uy * enemy.speed; }
    else if (dist < 270) { vx = -ux * enemy.speed; vy = -uy * enemy.speed; }
    else { vx = -uy * enemy.speed * 0.6; vy = ux * enemy.speed * 0.6; }
    enemy.atk -= dt;
    if (enemy.atk <= 0) {
      enemy.atk = 3.4;
      if (minionCount(world) <= 4) {
        spawnMinion(world, 'dart', enemy.x - 40, enemy.y + 30);
        spawnMinion(world, 'dart', enemy.x + 40, enemy.y + 30);
        world.events.push('summon');
      }
    }
    enemy.spitTimer -= dt;
    if (enemy.spitTimer <= 0) {
      enemy.spitTimer = 2.1;
      const base = Math.atan2(dy, dx);
      for (const off of [-0.22, 0, 0.22]) fireSpit(world, enemy.x, enemy.y, base + off);
      world.events.push('spit');
    }
  } else if (enemy.kind === 'mirror') {
    vx = ux * enemy.speed; vy = uy * enemy.speed;
    enemy.shieldTimer -= dt;
    if (enemy.shieldTimer <= 0) { enemy.shield = 2.5; enemy.shieldTimer = 9; world.events.push('shieldup'); }
    enemy.atk -= dt;
    if (enemy.atk <= 0) {
      enemy.atk = 2.8;
      fireRing(world, enemy, 12, 240, world.random() * 0.5);
      world.events.push('spit');
    }
  } else if (enemy.kind === 'choir') {
    enemy.angle += dt * 0.45;
    const tx = player.x + Math.cos(enemy.angle) * 300;
    const ty = player.y + Math.sin(enemy.angle) * 300;
    const tdx = tx - enemy.x;
    const tdy = ty - enemy.y;
    const td = Math.hypot(tdx, tdy) || 1;
    vx = (tdx / td) * enemy.speed * 2.2;
    vy = (tdy / td) * enemy.speed * 2.2;
    enemy.spitTimer -= dt;
    if (enemy.spitTimer <= 0) {
      enemy.spitTimer = 0.55;
      enemy.spitAngle += 0.62;
      fireSpit(world, enemy.x, enemy.y, enemy.spitAngle, 250);
      world.events.push('spit');
    }
  } else if (enemy.kind === 'thorn') {
    vx = ux * enemy.speed; vy = uy * enemy.speed;
    enemy.atk -= dt;
    if (enemy.atk <= 0) {
      enemy.atk = 2.6;
      fireRing(world, enemy, 10, 230, world.random() * 0.6);
      world.events.push('spit');
    }
    enemy.spitTimer -= dt;
    if (enemy.spitTimer <= 0) {
      enemy.spitTimer = 6;
      if (minionCount(world) <= 4) {
        spawnMinion(world, 'shade', enemy.x - 50, enemy.y);
        spawnMinion(world, 'shade', enemy.x + 50, enemy.y);
        world.events.push('summon');
      }
    }
  } else if (enemy.kind === 'wyrm') {
    const sway = Math.sin(world.time * 2.4 + enemy.wobble) * 0.75;
    const wx = ux * Math.cos(sway) - uy * Math.sin(sway);
    const wy = ux * Math.sin(sway) + uy * Math.cos(sway);
    vx = wx * enemy.speed; vy = wy * enemy.speed;
    enemy.trail.unshift({ x: enemy.x, y: enemy.y });
    if (enemy.trail.length > 42) enemy.trail.pop();
    enemy.spitTimer -= dt;
    if (enemy.spitTimer <= 0) {
      enemy.spitTimer = 4.5;
      fireSpitAt(world, enemy);
      world.events.push('spit');
    }
  } else if (enemy.kind === 'king') {
    vx = ux * enemy.speed; vy = uy * enemy.speed;
    enemy.atk -= dt;
    if (enemy.atk <= 0) {
      enemy.atk = 3.4;
      burst(world, enemy.x, enemy.y, '#f2ead8', 18, 240);
      const angle = world.random() * Math.PI * 2;
      const hop = range(world.random, 280, 440);
      enemy.x = Math.min(FIELD.width - 70, Math.max(70, player.x + Math.cos(angle) * hop));
      enemy.y = Math.min(FIELD.height - 70, Math.max(70, player.y + Math.sin(angle) * hop));
      burst(world, enemy.x, enemy.y, '#f2ead8', 18, 240);
      fireRing(world, enemy, 8, 235);
      world.events.push('teleport');
      if (enemy.hp < enemy.maxHp * 0.5 && minionCount(world) <= 3) {
        spawnMinion(world, 'shade', enemy.x - 46, enemy.y + 20);
        spawnMinion(world, 'shade', enemy.x + 46, enemy.y + 20);
      }
    }
    enemy.spitTimer -= dt;
    if (enemy.spitTimer <= 0) {
      enemy.spitTimer = 1.7;
      fireSpitAt(world, enemy);
      world.events.push('spit');
    }
  }

  enemy.x += vx * dt + enemy.kx * dt;
  enemy.y += vy * dt + enemy.ky * dt;
  enemy.x = Math.min(FIELD.width - 30, Math.max(30, enemy.x));
  enemy.y = Math.min(FIELD.height - 30, Math.max(30, enemy.y));
  const decay = Math.max(0, 1 - 7 * dt);
  enemy.kx *= decay;
  enemy.ky *= decay;
  if (dist < enemy.radius + PLAYER.radius) hurtPlayer(world, enemy.damage, enemy);
}

/** Shades are not a liquid: no two may share the same space. A pair
 * that overlaps is pushed apart along the line between them, the
 * lighter one moving more, so a chase forms a ring around the keeper
 * with gaps to slip through instead of one stacked blob that cannot
 * be escaped or shot apart. */
function separateEnemies(world) {
  const enemies = world.enemies;
  for (let i = 0; i < enemies.length; i += 1) {
    for (let j = i + 1; j < enemies.length; j += 1) {
      const a = enemies[i];
      const b = enemies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = (a.radius + b.radius) * 0.92;
      const distSq = dx * dx + dy * dy;
      if (distSq >= min * min || distSq === 0) continue;
      const dist = Math.sqrt(distSq);
      const push = (min - dist) / 2;
      const ux = dx / dist;
      const uy = dy / dist;
      const aShare = b.radius / (a.radius + b.radius);
      const bShare = a.radius / (a.radius + b.radius);
      a.x -= ux * push * aShare * 2 * 0.5;
      a.y -= uy * push * aShare * 2 * 0.5;
      b.x += ux * push * bShare * 2 * 0.5;
      b.y += uy * push * bShare * 2 * 0.5;
    }
  }
}

function stepSpits(world, dt) {
  const player = world.player;
  const kept = [];
  for (const spit of world.spits) {
    spit.x += spit.vx * dt;
    spit.y += spit.vy * dt;
    spit.life -= dt;
    const dx = player.x - spit.x;
    const dy = player.y - spit.y;
    if (dx * dx + dy * dy < (PLAYER.radius + SPIT.radius) ** 2) { hurtPlayer(world, 10); continue; }
    if (spit.life > 0) kept.push(spit);
  }
  world.spits = kept;
}

function stepEmbers(world, dt) {
  const player = world.player;
  const kept = [];
  for (const ember of world.embers) {
    // Each size gathers its own way (see EMBER_KINDS): a small ember
    // never stirs — the keeper must walk over it — while the Ember
    // Charm widens the pull of the sizes that have one.
    const def = EMBER_KINDS[ember.kind || 'medium'];
    ember.life -= dt;
    const dx = player.x - ember.x;
    const dy = player.y - ember.y;
    const dist = Math.hypot(dx, dy) || 1;
    const magnetRange = def.magnetRadius > 0 ? def.magnetRadius + world.mods.magnet : 0;
    if (dist < magnetRange) {
      ember.x += (dx / dist) * def.magnetSpeed * dt;
      ember.y += (dy / dist) * def.magnetSpeed * dt;
    }
    if (dist < PLAYER.radius + def.radius + 4) {
      world.lantern.fuel = Math.min(world.lantern.maxFuel, world.lantern.fuel + def.fuel);
      world.score += def.score;
      world.embersCollected += 1;
      world.events.push('ember');
      burst(world, ember.x, ember.y, '#ffb347', 6, 130);
      continue;
    }
    if (ember.life > 0) kept.push(ember);
  }
  world.embers = kept;
}

const PLUS_KINDS = ['rapid', 'sun', 'fleet', 'aegis'];
const MINUS_KINDS = ['heavy', 'dim', 'jam'];

/** Place a new pickup. The spot is chosen so a run never hands the
 * player a hex by accident or hides a blessing out of reach: never on
 * top of the keeper, never under another item, always a short detour
 * away (ITEMS.minPlayerDist..maxPlayerDist). */
export function spawnItem(world) {
  const player = world.player;
  let kind = null;
  const roll = world.random();
  if (roll < STOCK.bombChance && world.stock.bomb < STOCK.bombMax) kind = 'bomb';
  else if (roll < STOCK.bombChance + STOCK.mendChance && world.stock.mend < STOCK.mendMax) kind = 'mend';
  if (!kind) {
    const plus = world.random() < 0.55;
    const pool = plus ? PLUS_KINDS : MINUS_KINDS;
    kind = pool[Math.floor(world.random() * pool.length) % pool.length];
    if (kind === 'aegis' && world.random() < 0.5) kind = 'rapid'; // the ward is the rare one
  }
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const x = range(world.random, 70, FIELD.width - 70);
    const y = range(world.random, 70, FIELD.height - 70);
    const dist = Math.hypot(x - player.x, y - player.y);
    if (dist < ITEMS.minPlayerDist || dist > ITEMS.maxPlayerDist) continue;
    if (world.items.some((item) => Math.hypot(item.x - x, item.y - y) < 100)) continue;
    world.items.push({ kind, x, y, life: ITEMS.life });
    return;
  }
  // A crowded moment may refuse a spot; the next interval tries again.
}

function stepItems(world, dt) {
  if (world.phase === 'fighting') {
    world.itemTimer -= dt;
    if (world.itemTimer <= 0) {
      spawnItem(world);
      world.itemTimer = range(world.random, ITEMS.intervalMin, ITEMS.intervalMax);
    }
  }
  const player = world.player;
  const kept = [];
  for (const item of world.items) {
    item.life -= dt;
    const dist = Math.hypot(item.x - player.x, item.y - player.y);
    if (dist < PLAYER.radius + ITEMS.radius + 2) {
      const def = ITEM_KINDS[item.kind];
      if (def.stock) {
        world.stock[item.kind] += 1;
        world.events.push('pickupPlus');
        world.floaters.push({ x: player.x, y: player.y - 30, text: `Stocked: ${def.name}`, life: 1.3 });
      } else {
        world.effects[item.kind] = ITEMS.seconds;
        if (item.kind === 'sun') world.lantern.fuel = Math.min(world.lantern.maxFuel, world.lantern.fuel + 25);
        world.events.push(def.polarity === 'plus' ? 'pickupPlus' : 'pickupMinus');
        world.floaters.push({ x: player.x, y: player.y - 30, text: `${def.name}!`, life: 1.1 });
      }
      burst(world, item.x, item.y, def.color, 12, 190);
      continue;
    }
    if (item.life > 0) kept.push(item);
  }
  world.items = kept;
}

/** The Wayfarer Moth slips in from a random edge. It is in no hurry
 * and owes the keeper nothing: it drifts between idle points, and
 * when its visit is nearly over it makes for the nearest edge and is
 * gone. Catching it is a small chase, not a handout. */
function spawnSkipper(world) {
  const side = Math.floor(world.random() * 4);
  let x = 40;
  let y = 40;
  if (side === 0) { x = range(world.random, 60, FIELD.width - 60); y = 36; }
  if (side === 1) { x = range(world.random, 60, FIELD.width - 60); y = FIELD.height - 36; }
  if (side === 2) { x = 36; y = range(world.random, 60, FIELD.height - 60); }
  if (side === 3) { x = FIELD.width - 36; y = range(world.random, 60, FIELD.height - 60); }
  world.skipper = {
    x, y, tx: FIELD.width / 2, ty: FIELD.height / 2,
    t: 0, state: 'wander', sparkle: 0,
  };
  world.events.push('moth');
}

function stepSkipper(world, dt) {
  const moth = world.skipper;
  const player = world.player;
  moth.t += dt;
  if (moth.state === 'wander' && moth.t >= SKIPPER.lifetime - 2.5) {
    moth.state = 'leave';
    // Out the nearest edge, and no loitering on the way.
    const exits = [
      { x: moth.x, y: -50 }, { x: moth.x, y: FIELD.height + 50 },
      { x: -50, y: moth.y }, { x: FIELD.width + 50, y: moth.y },
    ];
    exits.sort((a, b) => Math.hypot(a.x - moth.x, a.y - moth.y) - Math.hypot(b.x - moth.x, b.y - moth.y));
    moth.tx = exits[0].x;
    moth.ty = exits[0].y;
  }
  const dx = moth.tx - moth.x;
  const dy = moth.ty - moth.y;
  const dist = Math.hypot(dx, dy);
  const speed = moth.state === 'leave' ? 165 : 58;
  if (dist > 4) {
    const wobble = Math.sin(world.time * 2.2) * 22;
    const ux = dx / dist;
    const uy = dy / dist;
    moth.x += (ux * speed - uy * wobble) * dt;
    moth.y += (uy * speed + ux * wobble) * dt;
  } else if (moth.state === 'wander') {
    moth.tx = range(world.random, 110, FIELD.width - 110);
    moth.ty = range(world.random, 110, FIELD.height - 110);
  }
  moth.sparkle -= dt;
  if (moth.sparkle <= 0) {
    moth.sparkle = 0.12;
    world.particles.push({
      x: moth.x + range(world.random, -8, 8), y: moth.y + range(world.random, -8, 8),
      vx: range(world.random, -14, 14), vy: range(world.random, -6, 20),
      life: 0.5, maxLife: 0.5, color: '#ffeeb8', size: range(world.random, 1.5, 3),
    });
  }
  if (moth.state === 'leave' && (moth.x < -30 || moth.x > FIELD.width + 30 || moth.y < -30 || moth.y > FIELD.height + 30)) {
    world.skipper = null;
    world.noHitWaves = 0; // it will not come again until re-earned
    return;
  }
  if (Math.hypot(player.x - moth.x, player.y - moth.y) < PLAYER.radius + 20) {
    catchSkipper(world);
  }
}

/** Caught. The moth shows the keeper a shortcut: the current wave
 * ends at once and the run resumes minSkip..maxSkip waves further on
 * (the usual upgrade choice still comes first). Waves leapt over are
 * not fought, so no boss in them is beaten and the theme holds. */
function catchSkipper(world) {
  const roll = SKIPPER.minSkip + Math.floor(world.random() * (SKIPPER.maxSkip - SKIPPER.minSkip + 1));
  // The leap itself pays a little at once; the real prize is that
  // every wave from there on is worth more (clearing pays wave × 10).
  const leapBonus = roll * 25;
  world.score += leapBonus;
  world.skipper = null;
  world.noHitWaves = 0;
  world.enemies = [];
  world.spits = [];
  world.bolts = [];
  world.toSpawn = 0;
  world.wave += roll - 1; // startWave adds the last step
  world.phase = 'rest';
  world.restTimer = 0.7;
  world.events.push('skip');
  world.floaters.push({ x: world.player.x, y: world.player.y - 46, text: `The moth shows a shortcut: +${roll} waves, +${leapBonus}!`, life: 1.8 });
  burst(world, world.player.x, world.player.y, '#ffeeb8', 30, 260);
}

/** Use a stocked Mend Tonic: heal, if there is anything to heal. */
export function useMend(world) {
  if (world.stock.mend <= 0 || world.player.hp >= PLAYER.maxHp || world.phase === 'over') return;
  world.stock.mend -= 1;
  world.player.hp = Math.min(PLAYER.maxHp, world.player.hp + STOCK.mendHeal);
  world.events.push('heal');
  world.floaters.push({ x: world.player.x, y: world.player.y - 30, text: `+${STOCK.mendHeal} HP`, life: 1.1 });
  burst(world, world.player.x, world.player.y, '#6bff8a', 16, 170);
}

/** Use the stocked Dawn Bomb: every shade on the field burns away.
 * Their score counts; their embers do not drop. */
export function useBomb(world) {
  if (world.stock.bomb <= 0 || world.phase === 'over') return;
  world.stock.bomb -= 1;
  for (const enemy of world.enemies) {
    world.score += enemy.score;
    world.kills += 1;
    burst(world, enemy.x, enemy.y, '#fff3c4', 10, 260);
  }
  world.enemies = [];
  world.spits = [];
  world.flash = 0.45;
  world.shake = 14;
  world.events.push('bomb');
}

function stepParticles(world, dt) {
  const kept = [];
  for (const p of world.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dt;
    if (p.life > 0) kept.push(p);
  }
  world.particles = kept;
  const floaters = [];
  for (const f of world.floaters) {
    f.y -= 34 * dt;
    f.life -= dt;
    if (f.life > 0) floaters.push(f);
  }
  world.floaters = floaters;
}

/** A simple pilot for screenshot scenes: chase embers, keep clear of
 * enemies, and shoot the nearest one. */
export function autopilot(world) {
  const player = world.player;
  let moveX = 0;
  let moveY = 0;
  let nearestEnemy = null;
  let nearestDist = Infinity;
  for (const enemy of world.enemies) {
    const d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (d < nearestDist) { nearestDist = d; nearestEnemy = enemy; }
    if (d < 130) { moveX += (player.x - enemy.x) / (d || 1) * 1.6; moveY += (player.y - enemy.y) / (d || 1) * 1.6; }
  }
  let target = null;
  let targetDist = Infinity;
  for (const ember of world.embers) {
    const d = Math.hypot(ember.x - player.x, ember.y - player.y);
    if (d < targetDist) { targetDist = d; target = ember; }
  }
  // A blessing is worth a detour when nothing is about to bite: it beats
  // an ember as the pilot's target. Hexes are never a target.
  if (nearestDist > 210) {
    for (const item of world.items) {
      if (ITEM_KINDS[item.kind].polarity !== 'plus') continue;
      const d = Math.hypot(item.x - player.x, item.y - player.y);
      if (d < 560) { target = item; targetDist = d; break; }
    }
  }
  if (target) { moveX += (target.x - player.x) / (targetDist || 1); moveY += (target.y - player.y) / (targetDist || 1); }
  const length = Math.hypot(moveX, moveY);
  if (length > 1) { moveX /= length; moveY /= length; }
  return {
    move: { x: moveX, y: moveY },
    aim: nearestEnemy ? { x: nearestEnemy.x, y: nearestEnemy.y } : { x: player.x + 100, y: player.y },
    firing: Boolean(nearestEnemy),
  };
}
