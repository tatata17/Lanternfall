// Lanternfall rendering: everything the player sees, drawn on one canvas.
// The world is lit only around the lantern: the scene is drawn first,
// then a darkness layer with a warm hole cut at the player's light.

import { BOSS_KINDS, EMBER_KINDS, FIELD, ITEM_KINDS, ITEMS, LANTERN, PLAYER, THEMES } from './config.js';
import { lightRadius } from './world.js';

/** The palette the world currently wears; it turns at each boss. */
export function themeOf(world) {
  return THEMES[world.theme % THEMES.length];
}

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function drawScene(ctx, world, ui) {
  ctx.save();
  if (world.shake > 0.3) {
    ctx.translate((Math.random() - 0.5) * world.shake, (Math.random() - 0.5) * world.shake);
  }
  drawFloor(ctx, world);
  drawEmbers(ctx, world);
  drawItems(ctx, world);
  drawEnemies(ctx, world);
  drawBolts(ctx, world);
  drawSpits(ctx, world);
  drawPlayer(ctx, world);
  drawParticles(ctx, world);
  drawDarkness(ctx, world);
  drawEyes(ctx, world);
  drawSkipper(ctx, world);
  drawDamageFeedback(ctx, world);
  if (world.flash > 0) {
    ctx.fillStyle = `rgba(255, 246, 220, ${(world.flash * 1.4).toFixed(3)})`;
    ctx.fillRect(-20, -20, FIELD.width + 40, FIELD.height + 40);
  }
  drawFloaters(ctx, world);
  ctx.restore();
  if (!ui || ui.hud !== false) drawHud(ctx, world, ui);
}

function drawFloor(ctx, world) {
  const theme = themeOf(world);
  const gradient = ctx.createLinearGradient(0, 0, 0, FIELD.height);
  gradient.addColorStop(0, theme.floor);
  gradient.addColorStop(1, theme.bg);
  ctx.fillStyle = gradient;
  ctx.fillRect(-20, -20, FIELD.width + 40, FIELD.height + 40);
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= FIELD.width; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, FIELD.height); ctx.stroke();
  }
  for (let y = 0; y <= FIELD.height; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(FIELD.width, y); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 196, 107, 0.25)';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, FIELD.width - 12, FIELD.height - 12);
}

function drawPlayer(ctx, world) {
  const p = world.player;
  const flicker = world.hurtTimer > 0 && Math.floor(world.time * 18) % 2 === 0;
  // The Aegis Ward shows as a blue ring around the keeper.
  if (world.effects.aegis > 0) {
    ctx.strokeStyle = 'rgba(127, 178, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER.radius + 10 + Math.sin(world.time * 5) * 2, 0, Math.PI * 2); ctx.stroke();
  }
  // The lantern glow under the keeper.
  const glow = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 70);
  glow.addColorStop(0, 'rgba(255, 190, 90, 0.5)');
  glow.addColorStop(1, 'rgba(255, 190, 90, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(p.x, p.y, 70, 0, Math.PI * 2); ctx.fill();
  // Body.
  ctx.fillStyle = flicker ? '#fff3d6' : '#ffd98a';
  ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER.radius, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8a5a1e';
  ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER.radius - 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe9b0';
  ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
  // Aim arm toward the mouse.
  const ax = p.x + Math.cos(p.aimAngle) * 26;
  const ay = p.y + Math.sin(p.aimAngle) * 26;
  ctx.strokeStyle = '#ffd98a';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ax, ay); ctx.stroke();
  ctx.fillStyle = '#fff6d8';
  ctx.beginPath(); ctx.arc(ax, ay, 5, 0, Math.PI * 2); ctx.fill();
}

function drawEnemies(ctx, world) {
  const theme = themeOf(world);
  for (const enemy of world.enemies) {
    const color = enemy.boss ? BOSS_KINDS[enemy.kind].color : theme[enemy.kind];
    const pulse = 1 + Math.sin(world.time * 6 + enemy.wobble) * 0.07;
    // A faint halo, so a shade in the dark is a threat you can see coming
    // rather than a surprise: the darkness still hides its exact shape.
    const halo = ctx.createRadialGradient(enemy.x, enemy.y, 2, enemy.x, enemy.y, enemy.radius * 2.1);
    halo.addColorStop(0, `rgba(${hexRgb(color)}, 0.30)`);
    halo.addColorStop(1, `rgba(${hexRgb(color)}, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.radius * 2.1, 0, Math.PI * 2); ctx.fill();
    if (enemy.boss) { drawBoss(ctx, enemy, world); continue; }
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.92;
    if (enemy.kind === 'dart') {
      ctx.beginPath();
      ctx.moveTo(enemy.radius, 0); ctx.lineTo(-enemy.radius, -enemy.radius * 0.7); ctx.lineTo(-enemy.radius, enemy.radius * 0.7);
      ctx.closePath(); ctx.fill();
    } else if (enemy.kind === 'brute') {
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        const r = enemy.radius * (i % 2 === 0 ? 1 : 0.82);
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (!enemy.boss && enemy.hp < enemy.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 10, enemy.radius * 2, 5);
      ctx.fillStyle = '#ff8a7a';
      ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 10, enemy.radius * 2 * (enemy.hp / enemy.maxHp), 5);
    }
  }
}

/** The eight bosses, each drawn its own way. Their colours are their
 * own and do not turn with the theme: a boss should be recognisable
 * on sight in any palette. */
function drawBoss(ctx, enemy, world) {
  const color = BOSS_KINDS[enemy.kind].color;
  const r = enemy.radius;
  // A charging boss telegraphs its line, wide as its body, so the
  // keeper can step off it. Fair, and it looks dangerous.
  if ((enemy.kind === 'whale' || enemy.kind === 'bull') && enemy.state === 'telegraph') {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(Math.atan2(enemy.aimY, enemy.aimX));
    ctx.fillStyle = 'rgba(255, 70, 50, 0.13)';
    ctx.fillRect(0, -r * 0.85, 780, r * 1.7);
    ctx.fillStyle = 'rgba(255, 70, 50, 0.4)';
    ctx.fillRect(0, -2, 780, 4);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.globalAlpha = 0.95;
  if (enemy.kind === 'whale') {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.35, r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 1.25, 0); ctx.lineTo(-r * 1.85, -r * 0.55); ctx.lineTo(-r * 1.85, r * 0.55);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.ellipse(r * 0.3, -r * 0.2, r * 0.55, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  } else if (enemy.kind === 'weaver') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + Math.sin(world.time * 3 + i) * 0.14;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
      ctx.lineTo(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45);
      ctx.lineTo(Math.cos(a + 0.4) * r * 1.7, Math.sin(a + 0.4) * r * 1.7);
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx.fill();
  } else if (enemy.kind === 'mirror') {
    ctx.save();
    ctx.rotate(world.time * 0.4);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.25); ctx.lineTo(r * 0.85, 0); ctx.lineTo(0, r * 1.25); ctx.lineTo(-r * 0.85, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.6); ctx.lineTo(r * 0.4, 0); ctx.lineTo(0, r * 0.6); ctx.lineTo(-r * 0.4, 0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    if (enemy.shield > 0) {
      ctx.strokeStyle = 'rgba(191, 232, 255, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (enemy.kind === 'bull') {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffe1b0';
    ctx.lineWidth = 6;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.75, -r * 0.55);
      ctx.quadraticCurveTo(s * r * 1.45, -r * 1.05, s * r * 1.3, -r * 0.25);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.arc(0, r * 0.25, r * 0.42, 0, Math.PI * 2); ctx.fill();
  } else if (enemy.kind === 'choir') {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 6; i += 1) {
      const a = world.time * 1.6 + (i / 6) * Math.PI * 2;
      const ox = Math.cos(a) * r * 1.3;
      const oy = Math.sin(a) * r * 1.3;
      ctx.beginPath(); ctx.arc(ox, oy, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0b1020';
      ctx.beginPath(); ctx.arc(ox, oy, r * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
    }
  } else if (enemy.kind === 'thorn') {
    ctx.fillStyle = color;
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2 + world.time * 0.15;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.16) * r * 0.8, Math.sin(a - 0.16) * r * 0.8);
      ctx.lineTo(Math.cos(a) * r * 1.42, Math.sin(a) * r * 1.42);
      ctx.lineTo(Math.cos(a + 0.16) * r * 0.8, Math.sin(a + 0.16) * r * 0.8);
      ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2); ctx.fill();
  } else if (enemy.kind === 'wyrm') {
    ctx.fillStyle = color;
    const trail = enemy.trail || [];
    for (let i = trail.length - 1; i >= 4; i -= 4) {
      const p = trail[i];
      const rr = Math.max(6, r * (1 - (i / Math.max(1, trail.length)) * 0.55));
      ctx.beginPath(); ctx.arc(p.x - enemy.x, p.y - enemy.y, rr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.arc(r * 0.3, 0, r * 0.35, 0, Math.PI * 2); ctx.fill();
  } else if (enemy.kind === 'king') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.15);
    ctx.lineTo(r * 0.85, r * 1.05);
    ctx.lineTo(-r * 0.85, r * 1.05);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd94d';
    for (const s of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(s * r - r * 0.14, -r * 1.1);
      ctx.lineTo(s * r, -r * 1.52);
      ctx.lineTo(s * r + r * 0.14, -r * 1.1);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillRect(-r * 0.62, -r * 1.16, r * 1.24, r * 0.16);
  }
  ctx.restore();
}

/** The Wayfarer Moth, drawn after the darkness because it carries its
 * own small light: a pale body and two wings that never stop moving. */
function drawSkipper(ctx, world) {
  const moth = world.skipper;
  if (!moth) return;
  const flap = Math.sin(world.time * 26) * 0.55;
  const glow = ctx.createRadialGradient(moth.x, moth.y, 2, moth.x, moth.y, 52);
  glow.addColorStop(0, 'rgba(255, 238, 184, 0.5)');
  glow.addColorStop(1, 'rgba(255, 238, 184, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(moth.x, moth.y, 52, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(moth.x, moth.y);
  ctx.fillStyle = 'rgba(255, 244, 214, 0.9)';
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    ctx.rotate(-0.5 - flap * s * 0.4);
    ctx.beginPath(); ctx.ellipse(10, -3, 13, 6.5, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#fff8e2';
  ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (moth.state === 'leave') {
    ctx.fillStyle = '#ffeeb8';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('It is leaving…', moth.x, moth.y - 30);
    ctx.textAlign = 'left';
  }
}

/** Pickups: a shape per kind, in its own colour, and a ring that tells
 * the polarity before the shape is even read — a smooth gold ring for a
 * blessing, a jagged violet ring for a hex. They blink before expiring. */
function drawItems(ctx, world) {
  for (const item of world.items) {
    const def = ITEM_KINDS[item.kind];
    if (item.life < 3 && Math.floor(world.time * 6) % 2 === 0) continue;
    const bob = Math.sin(world.time * 3.4 + item.x * 0.7) * 3;
    const x = item.x;
    const y = item.y + bob;
    // Polarity ring.
    ctx.lineWidth = 2.5;
    if (def.polarity === 'plus') {
      const pulse = 1 + Math.sin(world.time * 5) * 0.08;
      ctx.strokeStyle = 'rgba(255, 217, 77, 0.9)';
      ctx.beginPath(); ctx.arc(x, y, (ITEMS.radius + 7) * pulse, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(178, 102, 255, 0.95)';
      ctx.beginPath();
      const spikes = 9;
      for (let i = 0; i <= spikes * 2; i += 1) {
        const a = (i / (spikes * 2)) * Math.PI * 2 + world.time * 0.8;
        const r = ITEMS.radius + (i % 2 === 0 ? 10 : 4);
        if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.stroke();
    }
    // Soft glow so a blessing in the dark can be found.
    const glow = ctx.createRadialGradient(x, y, 1, x, y, 30);
    glow.addColorStop(0, def.color + '55');
    glow.addColorStop(1, def.color + '00');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = def.color;
    ctx.strokeStyle = def.color;
    drawItemShape(ctx, item.kind, x, y);
  }
}

function drawItemShape(ctx, kind, x, y) {
  const r = ITEMS.radius;
  ctx.lineWidth = 3;
  if (kind === 'rapid') { // a five-point star
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const rad = i % 2 === 0 ? r : r * 0.45;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
      else ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath(); ctx.fill();
  } else if (kind === 'sun') { // a sun: disc and rays
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62);
      ctx.lineTo(x + Math.cos(a) * r * 1.05, y + Math.sin(a) * r * 1.05);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'fleet') { // a feather: a swept wing
    ctx.beginPath();
    ctx.moveTo(x - r * 0.9, y + r * 0.7);
    ctx.quadraticCurveTo(x - r * 0.2, y - r * 1.1, x + r * 0.95, y - r * 0.75);
    ctx.quadraticCurveTo(x + r * 0.3, y + r * 0.1, x - r * 0.9, y + r * 0.7);
    ctx.fill();
  } else if (kind === 'aegis') { // a shield ring
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'heavy') { // a kettlebell weight
    ctx.beginPath(); ctx.arc(x, y + r * 0.18, r * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y - r * 0.52, r * 0.38, Math.PI, 0); ctx.stroke();
  } else if (kind === 'dim') { // a soot cloud
    for (const [dx, dy, rad] of [[-0.45, 0.15, 0.52], [0.1, -0.25, 0.62], [0.55, 0.2, 0.48], [0, 0.35, 0.55]]) {
      ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rad * r, 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === 'mend') { // a tonic flask with a cross
    ctx.beginPath();
    ctx.moveTo(x - r * 0.25, y - r * 0.95);
    ctx.lineTo(x + r * 0.25, y - r * 0.95);
    ctx.lineTo(x + r * 0.25, y - r * 0.45);
    ctx.quadraticCurveTo(x + r * 0.85, y + r * 0.1, x + r * 0.62, y + r * 0.75);
    ctx.quadraticCurveTo(x, y + r * 1.05, x - r * 0.62, y + r * 0.75);
    ctx.quadraticCurveTo(x - r * 0.85, y + r * 0.1, x - r * 0.25, y - r * 0.45);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0d2b16';
    ctx.fillRect(x - r * 0.13, y - r * 0.28, r * 0.26, r * 0.72);
    ctx.fillRect(x - r * 0.36, y - r * 0.05, r * 0.72, r * 0.26);
  } else if (kind === 'bomb') { // a small dawn: a bursting sun
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55);
      ctx.lineTo(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15);
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y, r * 0.52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a5a1e';
    ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'jam') { // a cracked gem
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.9); ctx.lineTo(x + r * 0.8, y - r * 0.2); ctx.lineTo(x, y + r * 0.95); ctx.lineTo(x - r * 0.8, y - r * 0.2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2a0f26';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - r * 0.3, y - r * 0.5); ctx.lineTo(x + r * 0.1, y); ctx.lineTo(x - r * 0.15, y + r * 0.55); ctx.stroke();
  }
}

function drawBolts(ctx, world) {
  for (const bolt of world.bolts) {
    ctx.strokeStyle = 'rgba(255, 214, 130, 0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bolt.x - bolt.vx * 0.03, bolt.y - bolt.vy * 0.03);
    ctx.lineTo(bolt.x, bolt.y);
    ctx.stroke();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath(); ctx.arc(bolt.x, bolt.y, 4, 0, Math.PI * 2); ctx.fill();
  }
}

function drawSpits(ctx, world) {
  ctx.fillStyle = '#8affc1';
  for (const spit of world.spits) {
    ctx.beginPath(); ctx.arc(spit.x, spit.y, 6, 0, Math.PI * 2); ctx.fill();
  }
}

function drawEmbers(ctx, world) {
  for (const ember of world.embers) {
    // Size is read at a glance: a small ember is a coal, a great one
    // a little sun, and the glow around each scales with it.
    const def = EMBER_KINDS[ember.kind || 'medium'];
    const blink = ember.life < 3 && Math.floor(world.time * 6) % 2 === 0;
    if (blink) continue;
    const bob = Math.sin(world.time * 4 + ember.x) * 3;
    const glow = ctx.createRadialGradient(ember.x, ember.y + bob, 1, ember.x, ember.y + bob, def.glow);
    glow.addColorStop(0, 'rgba(255, 170, 60, 0.85)');
    glow.addColorStop(1, 'rgba(255, 170, 60, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(ember.x, ember.y + bob, def.glow, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb347';
    ctx.beginPath(); ctx.arc(ember.x, ember.y + bob, Math.max(2, def.radius - 2), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff0c0';
    ctx.beginPath(); ctx.arc(ember.x, ember.y + bob, Math.max(1.4, def.radius * 0.32), 0, Math.PI * 2); ctx.fill();
  }
}

function drawParticles(ctx, world) {
  for (const p of world.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawDarkness(ctx, world) {
  const p = world.player;
  const radius = lightRadius(world) * (1 + Math.sin(world.time * 7) * 0.012);
  const gradient = ctx.createRadialGradient(p.x, p.y, radius * 0.45, p.x, p.y, radius);
  gradient.addColorStop(0, 'rgba(4, 6, 14, 0)');
  gradient.addColorStop(0.75, 'rgba(4, 6, 14, 0.48)');
  gradient.addColorStop(1, 'rgba(4, 6, 14, 0.90)');
  ctx.fillStyle = gradient;
  ctx.fillRect(-20, -20, FIELD.width + 40, FIELD.height + 40);
  // A warm tint inside the light, in the current theme's glow colour.
  const warm = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 0.6);
  warm.addColorStop(0, `rgba(${themeOf(world).glowRgb}, 0.10)`);
  warm.addColorStop(1, `rgba(${themeOf(world).glowRgb}, 0)`);
  ctx.fillStyle = warm;
  ctx.fillRect(-20, -20, FIELD.width + 40, FIELD.height + 40);
}

/** Eyes are drawn after the darkness on purpose: a shade's body hides in
 * the dark, but its eyes do not. Pairs of pale dots out in the black are
 * the game's signature warning. */
function drawEyes(ctx, world) {
  ctx.fillStyle = themeOf(world).eye;
  for (const enemy of world.enemies) {
    const look = Math.atan2(world.player.y - enemy.y, world.player.x - enemy.x);
    const ex = enemy.x + Math.cos(look) * enemy.radius * 0.35;
    const ey = enemy.y + Math.sin(look) * enemy.radius * 0.35;
    const gap = enemy.boss ? 10 : 4.5;
    const px = Math.cos(look + Math.PI / 2) * gap;
    const py = Math.sin(look + Math.PI / 2) * gap;
    const size = enemy.boss ? 5 : 2.8;
    ctx.beginPath(); ctx.arc(ex - px, ey - py, size, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + px, ey + py, size, 0, Math.PI * 2); ctx.fill();
  }
}

/** Damage feedback at the edges of the screen, because a bar in the
 * corner is easy to miss mid-fight: a hit flashes the rim red, and at
 * low health the rim stays lit and pulses until the keeper recovers. */
function drawDamageFeedback(ctx, world) {
  const hpShare = Math.max(0, world.player.hp) / PLAYER.maxHp;
  let alpha = 0;
  if (world.player.hurtTimer > 0) alpha = Math.max(alpha, 0.38 * (world.player.hurtTimer / PLAYER.hurtCooldown));
  if (hpShare <= 0.3 && world.phase !== 'over') alpha = Math.max(alpha, 0.16 + 0.1 * Math.sin(world.time * 6));
  if (alpha <= 0.01) return;
  const gradient = ctx.createRadialGradient(
    FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.36,
    FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.78,
  );
  gradient.addColorStop(0, 'rgba(255, 40, 30, 0)');
  gradient.addColorStop(1, `rgba(255, 40, 30, ${alpha.toFixed(3)})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
}

function drawFloaters(ctx, world) {
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const f of world.floaters) {
    ctx.globalAlpha = Math.min(1, f.life * 1.6);
    ctx.fillStyle = '#ffe1a0';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

export function drawHud(ctx, world, ui) {
  const pad = 18;
  ctx.textAlign = 'left';
  // Score and wave.
  ctx.fillStyle = 'rgba(6, 10, 20, 0.55)';
  ctx.fillRect(pad - 8, pad - 8, 252, 104);
  ctx.fillStyle = '#ffe9b0';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(`Score ${world.score}`, pad, pad + 24);
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.fillStyle = '#bcd2ff';
  ctx.fillText(`Wave ${Math.max(1, world.wave)}`, pad, pad + 52);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = '#9fb4dd';
  const left = world.toSpawn + world.enemies.length;
  ctx.fillText(world.phase === 'rest' ? 'The dark gathers…' : `Shades left: ${left}`, pad, pad + 76);
  let noteY = pad + 100;
  if (world.streak >= 3) {
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(`Streak ×${world.streak} — every shot must tell`, pad, noteY);
    noteY += 24;
  }
  if (world.noHitWaves > 0) {
    ctx.fillStyle = '#ffeeb8';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(`Flawless ×${world.noHitWaves} — at 5, a moth comes`, pad, noteY);
  }
  // A boss wears its health across the top centre, name and all.
  const boss = world.enemies.find((enemy) => enemy.boss);
  if (boss) {
    const width = 430;
    const x = (FIELD.width - width) / 2;
    ctx.fillStyle = 'rgba(6, 10, 20, 0.55)';
    ctx.fillRect(x - 10, pad - 8, width + 20, 52);
    ctx.fillStyle = BOSS_KINDS[boss.kind].color;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(boss.name, FIELD.width / 2, pad + 14);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, pad + 22, width, 10);
    ctx.fillStyle = '#ff8a7a';
    ctx.fillRect(x, pad + 22, width * Math.max(0, boss.hp / boss.maxHp), 10);
    ctx.textAlign = 'left';
  }

  // Health bar, with the number on it: a share alone is hard to read.
  const hpShare = Math.max(0, world.player.hp) / PLAYER.maxHp;
  const hpColor = hpShare <= 0.3 ? (Math.floor(world.time * 4) % 2 === 0 ? '#ff4b38' : '#ff8a76') : '#ff7a5c';
  bar(ctx, FIELD.width - pad - 240, pad, 240, 16, hpShare, hpColor, 'HP', `${Math.ceil(world.player.hp)} / ${PLAYER.maxHp}`);
  // Fuel bar, the heart of the game: it is also the light.
  const fuelShare = Math.max(0, world.lantern.fuel) / world.lantern.maxFuel;
  const fuelColor = fuelShare < 0.25 ? '#ff5c48' : '#ffc46b';
  bar(ctx, FIELD.width - pad - 240, pad + 28, 240, 16, fuelShare, fuelColor, 'LANTERN');
  if (fuelShare < 0.25 && Math.floor(world.time * 3) % 2 === 0) {
    ctx.fillStyle = '#ff8a76';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('FIND EMBERS — THE LIGHT IS DYING', FIELD.width - pad, pad + 68);
    ctx.textAlign = 'left';
  }
  // The toll warning: two hits inside the window means one more
  // costs a blessing level. It sits under the bars, in warning red,
  // stepping down a line when the dying-light warning is also up.
  const recentHits = world.hitTimes ? world.hitTimes.length : 0;
  const tollY = pad + (fuelShare < 0.25 ? 92 : 68);
  if (recentHits === 2 && world.phase === 'fighting') {
    ctx.fillStyle = '#ff6b57';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('ONE MORE HIT AND THE DARK TAKES A BLESSING', FIELD.width - pad, tollY);
    ctx.textAlign = 'left';
  } else if (recentHits === 1 && world.phase === 'fighting') {
    ctx.fillStyle = '#c8b8a8';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Hit once — two more in 30s cost a blessing', FIELD.width - pad, tollY);
    ctx.textAlign = 'left';
  }
  drawEffectChips(ctx, world);
  // In portrait pad mode the pads below the field carry the stocked
  // finds as real buttons, so the corner slots step aside — on the
  // small upright field they hid whatever crept from the corner.
  if (!ui || !ui.hideStockSlots) drawStockSlots(ctx, world);
  if (ui && ui.muted) {
    ctx.fillStyle = '#8fa3c8';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('Muted (M)', pad, FIELD.height - pad);
  }
}

/** The two stock slots, bottom right: icon, count, and the key or tap
 * that uses one. main.js hit-tests taps against these same rectangles. */
export function stockSlots(world) {
  const size = 76;
  const gap = 12;
  const y = FIELD.height - size - 16;
  const kinds = ['mend', 'bomb'];
  return kinds.map((kind, i) => ({
    kind,
    count: world.stock[kind],
    key: kind === 'mend' ? 'H' : 'B',
    x: FIELD.width - 16 - size * (kinds.length - i) - gap * (kinds.length - 1 - i),
    y,
    width: size,
    height: size,
  }));
}

function drawStockSlots(ctx, world) {
  for (const slot of stockSlots(world)) {
    const def = ITEM_KINDS[slot.kind];
    const ready = slot.count > 0;
    ctx.fillStyle = ready ? 'rgba(10, 16, 30, 0.78)' : 'rgba(10, 16, 30, 0.45)';
    ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
    ctx.strokeStyle = ready ? def.color : 'rgba(160, 175, 205, 0.4)';
    ctx.lineWidth = ready ? 2.5 : 1.5;
    ctx.strokeRect(slot.x, slot.y, slot.width, slot.height);
    ctx.save();
    ctx.globalAlpha = ready ? 1 : 0.35;
    ctx.fillStyle = def.color;
    ctx.strokeStyle = def.color;
    drawItemShape(ctx, slot.kind, slot.x + slot.width / 2, slot.y + 30);
    ctx.restore();
    ctx.fillStyle = ready ? '#ffffff' : '#8fa3c8';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`×${slot.count}  [${slot.key}]`, slot.x + slot.width / 2, slot.y + slot.height - 8);
    ctx.textAlign = 'left';
  }
}

/** Active pickup effects as chips across the top centre: the kind's
 * colour, its name, and the seconds left, draining as a thin bar. */
function drawEffectChips(ctx, world) {
  const active = Object.entries(world.effects).filter(([, t]) => t > 0);
  if (active.length === 0) return;
  const width = 168;
  const height = 34;
  const gap = 10;
  // Chips flow left to right and wrap to a second row when the field
  // is too narrow for them all (the portrait field, or a long run of
  // luck) — each row centred on its own.
  const perRow = Math.max(1, Math.floor((FIELD.width - 16 + gap) / (width + gap)));
  ctx.textAlign = 'left';
  active.forEach(([kind, t], index) => {
    const def = ITEM_KINDS[kind];
    const row = Math.floor(index / perRow);
    const col = index % perRow;
    const inRow = Math.min(perRow, active.length - row * perRow);
    const rowWidth = inRow * width + (inRow - 1) * gap;
    const x = (FIELD.width - rowWidth) / 2 + col * (width + gap);
    const y = 14 + row * (height + 6);
    ctx.fillStyle = 'rgba(6, 10, 20, 0.62)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = def.color;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(`${def.polarity === 'plus' ? '▲' : '▼'} ${def.name}`, x + 9, y + 17);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.ceil(t)}s`, x + width - 8, y + 17);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(x + 8, y + height - 8, width - 16, 4);
    ctx.fillStyle = def.color;
    ctx.fillRect(x + 8, y + height - 8, (width - 16) * Math.min(1, t / ITEMS.seconds), 4);
  });
}

function bar(ctx, x, y, width, height, share, color, label, value = null) {
  ctx.fillStyle = 'rgba(6, 10, 20, 0.55)';
  ctx.fillRect(x - 82, y - 4, width + 90, height + 8);
  ctx.fillStyle = '#dfe8ff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x - 76, y + height - 3);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * Math.min(1, share), height);
  if (value) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(value, x + width / 2, y + height - 3);
    ctx.textAlign = 'left';
  }
}
