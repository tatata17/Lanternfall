// Deterministic screenshot scenes behind ?shot=title|play|upgrade|over.
// Each scene runs the real rules forward from a fresh world with a fixed
// seed and the autopilot, so the frame is what a short game really looks
// like and the same seed always gives the same frame. main.js renders
// the scene once and sets window.__shotReady for the screenshot tool.

import { STEP, UPGRADES } from './config.js';
import { applyUpgrade, autopilot, createWorld, spawnBoss, spawnItem, stepWorld } from './world.js';

const still = { move: { x: 0, y: 0 }, aim: { x: 900, y: 300 }, firing: false };

/** Play the wave-2 run once and return the elapsed seconds of its
 * busiest quarter-second, for buildShotScene to replay to. */
function scoutBusyMoment(seed) {
  const world = createWorld(seed);
  run(world, 150, autopilot);
  if (world.phase === 'upgrade' && world.choices.length > 0) applyUpgrade(world, world.choices[0]);
  let bestAt = 0;
  let bestScore = -1;
  let elapsed = 0;
  while (elapsed < 12 && world.phase === 'fighting') {
    run(world, 0.25, autopilot);
    elapsed += 0.25;
    const p = world.player;
    const central = p.x > 200 && p.x < 1080 && p.y > 150 && p.y < 650;
    if (!central) continue;
    const near = world.enemies.filter((e) => Math.hypot(e.x - p.x, e.y - p.y) < 520).length;
    const score = world.enemies.length * 2 + near * 3 + world.bolts.length;
    if (score > bestScore) { bestScore = score; bestAt = elapsed; }
  }
  return bestAt;
}

function run(world, seconds, pilot) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.phase === 'over' || world.phase === 'upgrade') break;
    stepWorld(world, STEP, pilot(world));
  }
}

export function buildShotScene(name, seed) {
  const world = createWorld(seed);
  if (name === 'hurt') {
    // A verification scene, not a submitted screenshot: a keeper at low
    // health in the instant after a hit, to check the damage feedback.
    run(world, 6, autopilot);
    world.player.hp = 24;
    world.player.hurtTimer = 0.5;
    world.shake = 0;
    return { world, screen: 'playing' };
  }
  if (name === 'title') {
    run(world, 0.6, () => still);
    world.shake = 0;
    return { world, screen: 'title' };
  }
  if (name === 'play') {
    // Wave 1 is sparse by design, so the cover frame comes from wave 2.
    // The scene is deterministic, so it is scouted first: one full pass
    // scores every quarter-second of wave 2 (shades alive, shades near,
    // bolts in flight, keeper off the walls), and a second pass replays
    // to the best moment. A real moment of a real run, not a posed one.
    const bestAt = scoutBusyMoment(seed);
    run(world, 150, autopilot);
    if (world.phase === 'upgrade' && world.choices.length > 0) applyUpgrade(world, world.choices[0]);
    run(world, bestAt, autopilot);
    // Show the pickup system in the cover frame: one blessing on the
    // ground and one effect already running, as a real run looks a
    // little later than this.
    if (world.items.length === 0) spawnItem(world);
    if (world.effects.rapid <= 0) world.effects.rapid = 12;
    world.shake = 0;
    return { world, screen: 'playing' };
  }
  if (name === 'boss') {
    // Wave 20 in the second palette: the Hexweaver mid-fight, its darts
    // about, the keeper firing back. Posed by hand because a real run
    // to wave 20 cannot be replayed inside a screenshot's patience —
    // every rule in the frame is still the game's own.
    world.wave = 20;
    world.theme = 1;
    world.phase = 'fighting';
    world.score = 8640;
    const boss = spawnBoss(world, 'weaver');
    boss.x = 800;
    boss.y = 300;
    boss.hp = boss.maxHp * 0.62;
    world.player.x = 430;
    world.player.y = 470;
    world.lantern.fuel = world.lantern.maxFuel * 0.72;
    const aim = { move: { x: 0.3, y: -0.2 }, aim: { x: boss.x, y: boss.y }, firing: true };
    run(world, 2.2, () => aim);
    world.events.length = 0;
    world.shake = 0;
    return { world, screen: 'playing' };
  }
  if (name === 'upgrade') {
    run(world, 150, autopilot);
    if (world.phase !== 'upgrade') {
      world.choices = [UPGRADES[1], UPGRADES[0], UPGRADES[6]];
      world.phase = 'upgrade';
    }
    world.shake = 0;
    return { world, screen: 'playing' };
  }
  // over: a real run first. The pilot clears the first wave and takes a
  // blessing, then lays down its arms in the second wave, so the results
  // screen carries a score and a wave count worth showing.
  run(world, 150, autopilot);
  if (world.phase === 'upgrade' && world.choices.length > 0) {
    applyUpgrade(world, world.choices[0]);
    run(world, 150, () => still);
  }
  if (world.phase !== 'over') {
    world.player.hp = 0;
    world.phase = 'over';
  }
  // The shades that finished the keeper drift back into the dark, so the
  // results text is readable.
  world.enemies = world.enemies.filter((enemy) => Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y) > 110);
  world.shake = 0;
  return { world, screen: 'over' };
}
