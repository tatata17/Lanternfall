// Lanternfall entry point: screens, the fixed-step loop, and the wiring
// between input, world, rendering and sound.
// Screens: title -> playing (with upgrade and pause overlays) -> over.

import { FIELD, STEP, UPGRADES } from './config.js';
import { createInput } from './input.js';
import { applyUpgrade, createWorld, stepWorld, useBomb, useMend } from './world.js';
import { drawScene, stockSlots } from './render.js';
import { buildShotScene } from './shots.js';
import { isMuted, sfx, startAudio, toggleMute } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const padMoveZone = document.getElementById('stick-move');
const padAimZone = document.getElementById('stick-aim');
const input = createInput(canvas, padMoveZone && padAimZone ? { move: padMoveZone, aim: padAimZone } : null);

// Portrait pads: on a touch device held upright, the space under the
// field becomes a controller (see style.css .pad-mode). The class is
// decided here because the pads also change which hint shows; the
// canvas fit listens to the same resize events and follows.
function updatePadMode() {
  const portrait = window.innerHeight > window.innerWidth;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  document.body.classList.toggle('pad-mode', portrait && coarse);
}
window.addEventListener('resize', updatePadMode);
window.addEventListener('orientationchange', updatePadMode);
updatePadMode();

// Display fit: the page stretches the canvas to the largest 16:10 the
// viewport allows, and the backing store follows that on-screen size
// times the device pixel ratio (capped at 2), so the picture stays
// sharp on a phone and on a big monitor alike. All drawing stays in
// field coordinates — the transform below is the only place display
// size exists — and input already maps through the element's rect.
function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 10) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.round(rect.width * dpr);
  const height = Math.round(width * (FIELD.height / FIELD.width));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const scale = canvas.width / FIELD.width;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}
window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', fitCanvas);
document.addEventListener('fullscreenchange', () => setTimeout(fitCanvas, 60));
fitCanvas();

/** Fullscreen, and on Android a landscape lock to go with it: a page
 * cannot rotate the phone by itself (the browser forbids it without
 * fullscreen and a user gesture), so the button, the F key, and the
 * first tap into a run all ask for both together. Where the lock is
 * refused — iOS, some webviews — the game simply stays as it is, and
 * the portrait hint chip asks the player to turn the phone instead. */
function enterFullscreenLandscape() {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen()
    .then(() => {
      if (window.screen && screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    })
    .catch(() => {});
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else enterFullscreenLandscape();
}
const fsButton = document.getElementById('fs');
if (fsButton) fsButton.addEventListener('click', toggleFullscreen);

// The pads' stocked-find buttons mirror the H and B keys; their counts
// follow the world's stock, synced once per frame when it changes.
const padHealButton = document.getElementById('pad-heal');
const padBombButton = document.getElementById('pad-bomb');
const padHealCount = document.getElementById('pad-heal-count');
const padBombCount = document.getElementById('pad-bomb-count');
if (padHealButton) padHealButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  if (screen === 'playing') useMend(world);
});
if (padBombButton) padBombButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  if (screen === 'playing') useBomb(world);
});
let lastPadStock = '';
function syncPadStock() {
  if (!padHealCount || !padBombCount) return;
  const key = world.stock.mend + '/' + world.stock.bomb;
  if (key === lastPadStock) return;
  lastPadStock = key;
  padHealCount.textContent = '×' + world.stock.mend;
  padBombCount.textContent = '×' + world.stock.bomb;
  padHealButton.classList.toggle('off', world.stock.mend <= 0);
  padBombButton.classList.toggle('off', world.stock.bomb <= 0);
}

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const bestKey = 'lanternfall-best';
const aimKey = 'lanternfall-aim';

// Desktop aim style, chosen on the title screen and remembered:
// 'mouse' aims at the pointer; 'move' fires the way the keeper is
// walking (the last walked direction while standing still). Touch
// play is untouched — the twin sticks already aim for themselves.
let aimMode = 'mouse';
try { if (window.localStorage.getItem(aimKey) === 'move') aimMode = 'move'; } catch { /* storage unavailable */ }
let faceX = 1;
let faceY = 0;

// The trigger latch: a mouse press that clicked something — a title
// start, an upgrade card, a stock slot — is spent. It must be
// released before it can fire, or the tail of the choosing click
// looses a volley the keeper never meant (and a miss breaks the
// sharpshooter streak the player was protecting).
let triggerLatch = false;

const hintEl = document.getElementById('hint');
function syncAimHint() {
  if (!hintEl) return;
  hintEl.textContent = aimMode === 'move'
    ? 'WASD / arrows to move and aim · hold click or Space to fire · P pause · M mute · F fullscreen · Touch: thumbs on the field, or the pads below in portrait'
    : 'WASD / arrows to move · mouse to aim · hold click or Space to fire · P pause · M mute · F fullscreen · Touch: thumbs on the field, or the pads below in portrait';
}
function setAimMode(mode) {
  aimMode = mode;
  try { window.localStorage.setItem(aimKey, mode); } catch { /* storage unavailable */ }
  syncAimHint();
}
syncAimHint();

function aimOptionRects() {
  const width = 330;
  const height = 46;
  const gap = 28;
  const y = FIELD.width < FIELD.height ? 926 : 604;
  return [
    { mode: 'mouse', label: 'Aim with the mouse', x: FIELD.width / 2 - width - gap / 2, y, width, height },
    { mode: 'move', label: 'Fire the way you move', x: FIELD.width / 2 + gap / 2, y, width, height },
  ];
}

// A touch phone held upright gets a portrait field: the arena swaps
// its proportions (800x1280, the same area) so it fills the phone
// instead of sitting in a letterbox strip above the pads. Decided
// once, here, before any world exists — rotating mid-run keeps the
// field the run was born with. Screenshot scenes stay landscape
// unless they explicitly ask for the portrait field (&field=portrait)
// so the portrait layouts can be rendered and checked the same way.
if (params.get('field') === 'portrait' ||
    (!shotName && window.innerHeight > window.innerWidth && window.matchMedia('(pointer: coarse)').matches)) {
  FIELD.width = 800;
  FIELD.height = 1280;
  document.body.classList.add('field-portrait');
  fitCanvas();
}
const narrowField = () => FIELD.width < FIELD.height;

let screen = 'title';
let world = createWorld(20261117);
let banner = '';
let bannerTimer = 0;
let shotMode = false;

if (shotName) {
  const scene = buildShotScene(shotName, Number(params.get('seed') || 1));
  world = scene.world;
  screen = scene.screen;
  shotMode = true;
  document.body.classList.add('shot-mode');
  fitCanvas();
  drawFrame(0);
  window.__shotReady = true;
} else {
  requestAnimationFrame(frame);
}

let last = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let elapsed = (now - last) / 1000;
  last = now;
  if (elapsed > 0.25) elapsed = 0.25;
  accumulator += elapsed;
  while (accumulator >= STEP) {
    step(STEP);
    accumulator -= STEP;
  }
  drawFrame(elapsed);
  syncPadStock();
  input.endFrame();
}

function step(dt) {
  if (input.takePress('KeyM')) toggleMute();
  if (input.takePress('KeyF')) toggleFullscreen();
  if (screen === 'title') {
    stepWorld(world, dt, { move: { x: 0, y: 0 }, aim: { x: world.player.x + 120, y: world.player.y - 40 }, firing: false });
    if (input.takePress('KeyV')) setAimMode(aimMode === 'mouse' ? 'move' : 'mouse');
    if (input.takeClick()) {
      // A click on an aim option chooses it; anywhere else starts.
      const option = aimOptionRects().find((rect) => inRect(input.mouse, rect));
      if (option) { setAimMode(option.mode); return; }
      startRun();
    } else if (input.takePress('Enter') || input.takePress('Space')) startRun();
    return;
  }
  if (screen === 'over') {
    stepWorld(world, dt, { move: { x: 0, y: 0 }, aim: { x: world.player.x, y: world.player.y - 100 }, firing: false });
    if (input.takePress('KeyR') || input.takePress('Enter')) startRun();
    else if (input.takeClick() && inRect(input.mouse, restartRect())) startRun();
    return;
  }
  if (screen === 'paused') {
    if (input.takePress('KeyP') || input.takePress('Escape')) screen = 'playing';
    return;
  }
  // playing
  if (input.takePress('KeyP') || input.takePress('Escape')) { screen = 'paused'; return; }
  if (world.phase !== 'upgrade') {
    if (input.takePress('KeyH')) useMend(world);
    if (input.takePress('KeyB')) useBomb(world);
    // A tap on a stock slot uses it. Only a hit consumes the click, so
    // upgrade-card clicks in the branch below are never stolen. In pad
    // mode the slots are not drawn, so their taps are off too — the
    // pad buttons do this job there.
    const slots = document.body.classList.contains('pad-mode') ? [] : stockSlots(world);
    if (slots.some((slot) => inRect(input.mouse, slot)) && input.takeClick()) {
      for (const slot of slots) {
        if (inRect(input.mouse, slot)) {
          if (slot.kind === 'mend') useMend(world);
          else useBomb(world);
        }
      }
      triggerLatch = true;
      drainEvents();
      return;
    }
  }
  if (world.phase === 'upgrade') {
    handleUpgradeInput();
    stepWorld(world, dt, { move: { x: 0, y: 0 }, aim: input.mouse, firing: false });
    drainEvents();
    return;
  }
  stepWorld(world, dt, playInput());
  drainEvents();
  bannerTimer = Math.max(0, bannerTimer - dt);
  if (world.phase === 'over') {
    screen = 'over';
    saveBest();
  }
}

/** One step of player intent: twin-stick touch when thumbs are down,
 * keyboard and mouse otherwise. */
function playInput() {
  if (!input.mouse.down) triggerLatch = false;
  const aimStick = input.touchAim();
  const moveStick = input.touchMove();
  if (aimStick || moveStick) {
    return {
      move: moveStick || input.moveAxis(),
      aim: aimStick
        ? { x: world.player.x + aimStick.x * 260, y: world.player.y + aimStick.y * 260 }
        : input.mouse,
      firing: Boolean(aimStick),
    };
  }
  const move = input.moveAxis();
  if (move.x !== 0 || move.y !== 0) {
    const len = Math.hypot(move.x, move.y) || 1;
    faceX = move.x / len;
    faceY = move.y / len;
  }
  if (aimMode === 'move') {
    // Fire the way the keeper faces: the current walk direction, or
    // the last one while standing still. The pointer rests.
    return {
      move,
      aim: { x: world.player.x + faceX * 260, y: world.player.y + faceY * 260 },
      firing: (input.mouse.down && !triggerLatch) || input.keys.has('Space'),
    };
  }
  return { move, aim: input.mouse, firing: (input.mouse.down && !triggerLatch) || input.keys.has('Space') };
}

function startRun() {
  startAudio();
  sfx.start();
  triggerLatch = true;
  // Deliberately no automatic fullscreen here: an earlier version
  // asked on every run start, and in some Android file viewers each
  // ask re-raised the system's fullscreen banner over the game, where
  // it stayed. Fullscreen is the ⛶ button or the F key — one
  // deliberate tap, never a recurring interruption.
  world = createWorld((Math.random() * 1e9) | 0);
  screen = 'playing';
  banner = '';
  bannerTimer = 0;
}

function saveBest() {
  try {
    const best = Number(window.localStorage.getItem(bestKey) || 0);
    if (world.score > best) window.localStorage.setItem(bestKey, String(world.score));
  } catch { /* storage may be unavailable; the game plays on */ }
}

function readBest() {
  try { return Number(window.localStorage.getItem(bestKey) || 0); } catch { return 0; }
}

function drainEvents() {
  for (const event of world.events) {
    if (event === 'wave') { banner = world.bossName ? `Wave ${world.wave} — ${world.bossName}` : `Wave ${world.wave}`; bannerTimer = 2; sfx.waveClear(); }
    else if (event === 'waveClear') { /* the upgrade screen speaks for itself */ }
    else if (sfx[event]) sfx[event]();
  }
  world.events.length = 0;
}

function upgradeRects() {
  if (narrowField()) {
    // Portrait: the three cards stack down the tall field.
    const width = 470;
    const height = 158;
    const gap = 20;
    const x = (FIELD.width - width) / 2;
    const y = 316;
    return world.choices.map((choice, i) => ({ x, y: y + i * (height + gap), width, height, choice }));
  }
  const width = 300;
  const height = 168;
  const gap = 28;
  const total = width * 3 + gap * 2;
  const x0 = (FIELD.width - total) / 2;
  const y = 330;
  return world.choices.map((choice, i) => ({ x: x0 + i * (width + gap), y, width, height, choice }));
}

function restartRect() {
  return { x: FIELD.width / 2 - 130, y: narrowField() ? 640 : 520, width: 260, height: 64 };
}

function inRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function handleUpgradeInput() {
  const rects = upgradeRects();
  if (input.takeClick()) {
    for (const rect of rects) {
      if (inRect(input.mouse, rect)) { applyUpgrade(world, rect.choice); triggerLatch = true; banner = world.bossName ? `Wave ${world.wave} — ${world.bossName}` : `Wave ${world.wave}`; bannerTimer = 2; return; }
    }
  }
  const keys = ['Digit1', 'Digit2', 'Digit3'];
  for (let i = 0; i < keys.length; i += 1) {
    if (input.takePress(keys[i]) && rects[i]) { applyUpgrade(world, rects[i].choice); triggerLatch = true; banner = world.bossName ? `Wave ${world.wave} — ${world.bossName}` : `Wave ${world.wave}`; bannerTimer = 2; return; }
  }
}

function drawFrame() {
  ctx.clearRect(0, 0, FIELD.width, FIELD.height);
  const hud = screen === 'playing' || screen === 'paused';
  const hideStockSlots = document.body.classList.contains('pad-mode');
  drawScene(ctx, world, { muted: isMuted(), hud, hideStockSlots });
  if (bannerTimer > 0 && screen === 'playing') {
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 233, 176, 0.95)';
    ctx.fillText(banner, FIELD.width / 2, 120);
    ctx.textAlign = 'left';
  }
  if (screen === 'title') drawTitle();
  if (screen === 'paused') drawPaused();
  if (world.phase === 'upgrade' && screen === 'playing') drawUpgrade();
  if (screen === 'over') drawOver();
  drawSticks();
}

/** The twin-stick overlay: a ring where each thumb landed, a knob where
 * it is now. Only while thumbs are down. */
function drawSticks() {
  for (const stick of input.sticks()) {
    ctx.strokeStyle = 'rgba(255, 233, 176, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(stick.startX, stick.startY, 52, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255, 196, 107, 0.45)';
    ctx.beginPath(); ctx.arc(stick.x, stick.y, 24, 0, Math.PI * 2); ctx.fill();
  }
}

function panel(alpha = 0.72) {
  ctx.fillStyle = `rgba(5, 8, 16, ${alpha})`;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
}

function drawTitle() {
  panel(0.45);
  const narrow = narrowField();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffc46b';
  ctx.font = `bold ${narrow ? 72 : 92}px Georgia, serif`;
  ctx.fillText('LANTERNFALL', FIELD.width / 2, narrow ? 300 : 240);
  ctx.fillStyle = '#dfe8ff';
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillText('The dark is hungry. Your lantern is dinner.', FIELD.width / 2, narrow ? 358 : 292);
  ctx.font = `${narrow ? 18 : 20}px system-ui, sans-serif`;
  ctx.fillStyle = '#bcd2ff';
  const controlsLine = aimMode === 'move'
    ? 'Move with WASD or arrows — you fire the way you face · Hold click or Space to fire'
    : 'Move with WASD or arrows · Aim with the mouse · Hold click or Space to fire';
  if (narrow) {
    // The tall field gives the words room to breathe: the two long
    // explanations split across two lines each.
    ctx.fillText('On a touchscreen: left thumb moves, right thumb aims and fires', FIELD.width / 2, 434);
    ctx.fillText(controlsLine, FIELD.width / 2, 466);
    ctx.fillText('Shoot the shades, gather their embers, and never let the light go out.', FIELD.width / 2, 518);
    ctx.fillText('Clear a wave to choose an upgrade — and every tenth wave, something huge comes.', FIELD.width / 2, 570);
    ctx.fillText('Clearing pays the wave × 10, so deeper is richer.', FIELD.width / 2, 602);
    ctx.fillText('Gold-ringed blessings are worth a detour. Violet hexes are not.', FIELD.width / 2, 654);
    ctx.fillText('Rare finds can be stocked: H (or tap) heals, B clears the field.', FIELD.width / 2, 706);
    ctx.fillText('Eight hits in a row pays +100.', FIELD.width / 2, 738);
  } else {
    ctx.fillText(controlsLine, FIELD.width / 2, 356);
    ctx.fillText('On a touchscreen: left thumb moves, right thumb aims and fires', FIELD.width / 2, 332);
    ctx.fillText('Shoot the shades, gather their embers, and never let the light go out.', FIELD.width / 2, 390);
    ctx.fillText('Clear a wave to choose an upgrade — and every tenth wave, something huge comes. Clearing pays the wave × 10, so deeper is richer.', FIELD.width / 2, 424);
    ctx.fillText('Gold-ringed blessings are worth a detour. Violet hexes are not.', FIELD.width / 2, 458);
    ctx.fillText('Rare finds can be stocked: H (or tap) heals, B clears the field. Eight hits in a row pays +100.', FIELD.width / 2, 490);
  }
  const best = shotMode ? 0 : readBest();
  if (best > 0) {
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(`Best score: ${best}`, FIELD.width / 2, narrow ? 806 : 524);
  }
  ctx.fillStyle = '#ffc46b';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText('Click or press Enter to light the lantern', FIELD.width / 2, narrow ? 862 : 560);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#8fa3c8';
  ctx.fillText('Desktop aim — click to choose, or press V', FIELD.width / 2, narrow ? 912 : 590);
  for (const rect of aimOptionRects()) {
    const selected = aimMode === rect.mode;
    ctx.fillStyle = selected ? 'rgba(255, 196, 107, 0.20)' : 'rgba(16, 22, 40, 0.65)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = selected ? '#ffc46b' : 'rgba(150, 168, 205, 0.45)';
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.fillStyle = selected ? '#ffe9b0' : '#93a7cc';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(rect.label, rect.x + rect.width / 2, rect.y + 30);
  }
  ctx.textAlign = 'left';
}

function drawPaused() {
  panel(0.6);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#dfe8ff';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.fillText('Paused', FIELD.width / 2, FIELD.height / 2 - 20);
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText('Press P to return to the dark', FIELD.width / 2, FIELD.height / 2 + 24);
  ctx.textAlign = 'left';
}

function drawUpgrade() {
  panel(0.62);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe9b0';
  ctx.font = `bold ${narrowField() ? 34 : 44}px system-ui, sans-serif`;
  ctx.fillText(`Wave ${world.wave} cleared — choose a blessing`, FIELD.width / 2, 240);
  ctx.font = '19px system-ui, sans-serif';
  ctx.fillStyle = '#bcd2ff';
  ctx.fillText('Click a card, or press 1, 2 or 3', FIELD.width / 2, 278);
  for (const rect of upgradeRects()) {
    const hover = inRect(input.mouse, rect);
    ctx.fillStyle = hover ? 'rgba(255, 196, 107, 0.22)' : 'rgba(16, 24, 46, 0.92)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = '#ffc46b';
    ctx.lineWidth = hover ? 4 : 2;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.fillStyle = '#ffc46b';
    ctx.font = 'bold 27px system-ui, sans-serif';
    ctx.fillText(rect.choice.name, rect.x + rect.width / 2, rect.y + 58);
    ctx.fillStyle = '#dfe8ff';
    ctx.font = '19px system-ui, sans-serif';
    wrapText(rect.choice.text, rect.x + rect.width / 2, rect.y + 98, rect.width - 36, 24);
    if (rect.choice.max) {
      const level = world.levels[rect.choice.id] || 0;
      ctx.fillStyle = '#9fe8ff';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText(`Lv ${level} → ${level + 1}  (max ${rect.choice.max})`, rect.x + rect.width / 2, rect.y + 146);
    } else if (rect.choice.id === 'heart') {
      ctx.fillStyle = '#9fe8ff';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText('Instant — no level', rect.x + rect.width / 2, rect.y + 146);
    }
  }
  drawBuildSummary();
  ctx.textAlign = 'left';
}

/** The whole build at a glance, under the cards: every levelled
 * blessing with its pips, gold and marked when it stands at its max,
 * so what is finished and what is not is never a guessing game. */
function drawBuildSummary() {
  const stats = UPGRADES.filter((u) => !u.instant);
  ctx.font = '16px system-ui, sans-serif';
  const narrow = narrowField();
  const rows = narrow
    ? [stats.slice(0, 2), stats.slice(2, 4), stats.slice(4, 6), stats.slice(6)]
    : [stats.slice(0, 4), stats.slice(4)];
  const y0 = narrow ? 884 : 548;
  rows.forEach((row, rowIndex) => {
    const y = y0 + rowIndex * 30;
    const widths = row.map((u) => ctx.measureText(`${u.stat} `).width + u.max * 15 + 34);
    let x = FIELD.width / 2 - widths.reduce((a, b) => a + b, 0) / 2;
    row.forEach((u, i) => {
      const level = world.levels[u.id] || 0;
      const maxed = level >= u.max;
      ctx.fillStyle = maxed ? '#ffd94d' : '#9fb4dd';
      ctx.textAlign = 'left';
      ctx.fillText(`${u.stat} `, x, y);
      x += ctx.measureText(`${u.stat} `).width;
      for (let p = 0; p < u.max; p += 1) {
        ctx.beginPath();
        ctx.arc(x + 6, y - 5, 5, 0, Math.PI * 2);
        if (p < level) { ctx.fillStyle = maxed ? '#ffd94d' : '#7fd0ff'; ctx.fill(); }
        else { ctx.strokeStyle = '#5a6d94'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = maxed ? '#ffd94d' : '#9fb4dd'; }
        x += 15;
      }
      if (maxed) {
        ctx.fillStyle = '#ffd94d';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText('MAX', x + 2, y);
        ctx.font = '16px system-ui, sans-serif';
      }
      x += 34;
    });
  });
  ctx.textAlign = 'center';
}

function drawOver() {
  panel(0.66);
  ctx.textAlign = 'center';
  const narrow = narrowField();
  const y0 = narrow ? 60 : 0;
  ctx.fillStyle = '#ff8a76';
  ctx.font = `bold ${narrow ? 50 : 64}px Georgia, serif`;
  ctx.fillText('THE LIGHT GOES OUT', FIELD.width / 2, 250 + y0);
  ctx.fillStyle = '#dfe8ff';
  ctx.font = `${narrow ? 20 : 24}px system-ui, sans-serif`;
  ctx.fillText(`You kept the dark back for ${world.wave} wave${world.wave === 1 ? '' : 's'}`, FIELD.width / 2, 320 + y0);
  ctx.fillText(`Score ${world.score} · Shades felled ${world.kills} · Embers gathered ${world.embersCollected}`, FIELD.width / 2, 362 + y0);
  const accuracy = world.shotsFired > 0 ? Math.round((world.shotsHit / world.shotsFired) * 100) : 0;
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillStyle = '#9fb4dd';
  ctx.fillText(`Accuracy ${accuracy}% · Best streak ×${world.bestStreak} · Bosses felled ${world.bossesBeaten}`, FIELD.width / 2, 392 + y0);
  const best = shotMode ? world.score : Math.max(readBest(), world.score);
  ctx.fillStyle = '#ffe9b0';
  ctx.fillText(`Best score: ${best}`, FIELD.width / 2, 404 + y0 + (narrow ? 36 : 0));
  const rect = restartRect();
  ctx.fillStyle = 'rgba(255, 196, 107, 0.16)';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = '#ffc46b';
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.fillStyle = '#ffc46b';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText('Light it again (R)', FIELD.width / 2, rect.y + 41);
  ctx.textAlign = 'left';
}

function wrapText(text, cx, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, cx, yy);
      line = word;
      yy += lineHeight;
    } else line = next;
  }
  if (line) ctx.fillText(line, cx, yy);
}
