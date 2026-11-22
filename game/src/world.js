// BAYANG SENJA — the game's rules and state, with no drawing and no browser
// in it. step() advances one fixed step and returns what happened as bit
// flags, so the caller can react (sound, shake) without the world knowing
// about screens. Nothing here allocates after createWorld returns.
import {
  ARTIFACTS, COIN, COLS, CRATES, DETECTION, EXIT, FIELD, GUARD, GUARDS,
  LAMPS, LIGHT, PLAYER, PLAYER_START, ROWS, SHADOWS, TILE, WALLS, tileCentre,
} from './config.js';

export const EVENT_ARTIFACT = 1;
export const EVENT_COIN = 2;
export const EVENT_ALARM = 4;
export const EVENT_OVER = 8;
export const EVENT_WIN = 16;

/** True when the tile is a wall, a crate, or outside the museum. */
export function tileSolid(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
  for (const r of WALLS) if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return true;
  for (const r of CRATES) if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return true;
  return false;
}

export function pointSolid(x, y) {
  return tileSolid(Math.floor(x / TILE), Math.floor(y / TILE));
}

/** Line of sight: true when no wall or crate stands between the points. */
export function hasLOS(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 6));
  for (let i = 1; i < steps; i += 1) {
    if (pointSolid(ax + (dx * i) / steps, ay + (dy * i) / steps)) return false;
  }
  return true;
}

/** March a ray until it hits something or runs out of range; returns the distance. */
export function castRay(x, y, angle, maxDist) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let d = 8; d <= maxDist; d += 6) {
    if (pointSolid(x + dx * d, y + dy * d)) return d;
  }
  return maxDist;
}

/** 0..1: how bright the light is at a point (lamps + ambient, shadows dim it). */
export function lightAt(x, y) {
  let light = LIGHT.ambient;
  for (const lamp of LAMPS) {
    const c = tileCentre(lamp.x, lamp.y);
    const d = Math.hypot(x - c.x, y - c.y);
    if (d < LIGHT.lampRadius) light += LIGHT.lampStrength * (1 - d / LIGHT.lampRadius);
  }
  light = Math.min(1, light);
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  for (const s of SHADOWS) {
    if (tx >= s.x && tx < s.x + s.w && ty >= s.y && ty < s.y + s.h) return light * LIGHT.shadowMultiplier;
  }
  return light;
}

/** Weighted shortest-path search (Dijkstra) over walkable tiles from
 * (fromTx,fromTy) to (toTx,toTy). `extraCost` adds a per-tile cost (the
 * screenshot autopilot charges for danger; guards pass 0). The search
 * covers every physically walkable tile — including the map's edge ring —
 * so its bounds match tileSolid() exactly. Returns the tile path, or
 * null when unreachable. */
export function findPath(fromTx, fromTy, toTx, toTy, extraCost) {
  const key = (x, y) => y * COLS + x;
  const prev = new Map();
  const cost = new Map();
  const queue = [[fromTx, fromTy]];
  cost.set(key(fromTx, fromTy), 0);
  while (queue.length > 0) {
    let best = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (cost.get(key(queue[i][0], queue[i][1])) < cost.get(key(queue[best][0], queue[best][1]))) best = i;
    }
    const [cx, cy] = queue.splice(best, 1)[0];
    if (cx === toTx && cy === toTy) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (tileSolid(nx, ny)) continue;
      const k = key(nx, ny);
      const next = cost.get(key(cx, cy)) + 1 + (extraCost ? extraCost(nx, ny) : 0);
      if (!cost.has(k) || next < cost.get(k)) {
        cost.set(k, next);
        prev.set(k, [cx, cy]);
        queue.push([nx, ny]);
      }
    }
  }
  if (!cost.has(key(toTx, toTy))) return null;
  const path = [];
  let cur = [toTx, toTy];
  while (!(cur[0] === fromTx && cur[1] === fromTy)) {
    path.unshift(cur);
    cur = prev.get(key(cur[0], cur[1]));
    if (!cur) return null;
  }
  return path;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createWorld(random) {
  const player = { x: 0, y: 0, face: 0, sprinting: false, moving: false };
  const guards = [];
  for (const def of GUARDS) {
    const start = tileCentre(def.waypoints[0][0], def.waypoints[0][1]);
    guards.push({
      x: start.x, y: start.y, angle: 0, name: def.name,
      waypoints: def.waypoints.map(([tx, ty]) => tileCentre(tx, ty)),
      wpIndex: 1, wpDir: 1, state: 'patrol',
      target: null, lastSeen: null, lookTimer: 0, loseTimer: 0, scanAngle: 0,
      path: null, pathTimer: 0, pathKey: '',
    });
  }
  const artifacts = ARTIFACTS.map((a) => {
    const c = tileCentre(a.x, a.y);
    return { x: c.x, y: c.y, kind: a.kind, name: a.name, taken: false };
  });
  const exit = {
    x: EXIT.x * TILE, y: EXIT.y * TILE, w: EXIT.w * TILE, h: EXIT.h * TILE,
  };
  const particles = [];
  const state = {
    player, guards, artifacts, exit, particles,
    detection: 0, maxDetection: 0, alarms: 0, coinsLeft: COIN.count,
    coinCooldown: 0, coin: null, noise: null, noiseTimer: 0,
    elapsed: 0, taken: 0, won: false, lost: false, score: 0,
    trauma: 0, flash: 0, inShadow: false, seen: false,
  };

  function reset() {
    const start = tileCentre(PLAYER_START.x, PLAYER_START.y);
    player.x = start.x;
    player.y = start.y;
    player.face = 0;
    player.sprinting = false;
    player.moving = false;
    for (let i = 0; i < guards.length; i += 1) {
      const g = guards[i];
      const s = tileCentre(GUARDS[i].waypoints[0][0], GUARDS[i].waypoints[0][1]);
      g.x = s.x;
      g.y = s.y;
      g.angle = 0;
      g.wpIndex = 1;
      g.wpDir = 1;
      g.state = 'patrol';
      g.target = null;
      g.lastSeen = null;
      g.lookTimer = 0;
      g.loseTimer = 0;
      g.path = null;
      g.pathTimer = 0;
      g.pathKey = '';
    }
    for (const a of artifacts) a.taken = false;
    particles.length = 0;
    state.detection = 0;
    state.maxDetection = 0;
    state.alarms = 0;
    state.coinsLeft = COIN.count;
    state.coinCooldown = 0;
    state.coin = null;
    state.noise = null;
    state.noiseTimer = 0;
    state.elapsed = 0;
    state.taken = 0;
    state.won = false;
    state.lost = false;
    state.score = 0;
    state.trauma = 0;
    state.flash = 0;
    state.inShadow = false;
    state.seen = false;
  }

  function moveCircle(body, dx, dy, radius) {
    const nx = body.x + dx;
    if (!circleHitsSolid(nx, body.y, radius)) body.x = nx;
    const ny = body.y + dy;
    if (!circleHitsSolid(body.x, ny, radius)) body.y = ny;
  }

  function circleHitsSolid(x, y, radius) {
    const x0 = Math.floor((x - radius) / TILE);
    const x1 = Math.floor((x + radius) / TILE);
    const y0 = Math.floor((y - radius) / TILE);
    const y1 = Math.floor((y + radius) / TILE);
    for (let ty = y0; ty <= y1; ty += 1) {
      for (let tx = x0; tx <= x1; tx += 1) {
        if (!tileSolid(tx, ty)) continue;
        const cx = Math.max(tx * TILE, Math.min(x, (tx + 1) * TILE));
        const cy = Math.max(ty * TILE, Math.min(y, (ty + 1) * TILE));
        if ((x - cx) ** 2 + (y - cy) ** 2 < radius * radius) return true;
      }
    }
    return false;
  }

  /**
   * Steer a guard toward a tile with Dijkstra pathfinding (replanned twice
   * a second), so a chase or an investigation routes around walls instead
   * of walking straight into one forever. A failed search is cached as an
   * empty path for the replan interval, so it is not recomputed every
   * frame; the straight-walk fallback then only runs when no path exists
   * (an unreachable or non-walkable target). On this map every walkable
   * tile is connected, so it never fires in play. Returns true when the
   * guard moved.
   */
  function followPath(g, tx, ty, speed, dt) {
    const key = `${tx},${ty}`;
    g.pathTimer -= dt;
    if (g.pathKey !== key || g.pathTimer <= 0 || g.path === null) {
      g.path = findPath(Math.floor(g.x / TILE), Math.floor(g.y / TILE), tx, ty, 0) ?? [];
      g.pathKey = key;
      g.pathTimer = 0.5;
    }
    let dest;
    if (g.path && g.path.length > 0) {
      dest = tileCentre(g.path[0][0], g.path[0][1]);
      if (Math.hypot(dest.x - g.x, dest.y - g.y) < 6) {
        g.path.shift();
        if (g.path.length === 0) return false;
        dest = tileCentre(g.path[0][0], g.path[0][1]);
      }
    } else {
      dest = tileCentre(tx, ty);
    }
    const dx = dest.x - g.x;
    const dy = dest.y - g.y;
    const d = Math.hypot(dx, dy);
    if (d < 4) return false;
    const sp = speed * dt;
    moveCircle(g, (dx / d) * sp, (dy / d) * sp, GUARD.radius);
    g.angle = Math.atan2(dy, dx);
    return true;
  }

  function guardSees(g) {
    const dx = player.x - g.x;
    const dy = player.y - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist > GUARD.viewRange) return 0;
    if (Math.abs(angleDiff(Math.atan2(dy, dx), g.angle)) > GUARD.viewHalfAngle) return 0;
    if (!hasLOS(g.x, g.y, player.x, player.y)) return 0;
    return dist;
  }

  function investigate(g, x, y) {
    if (g.state === 'chase') return;
    g.state = 'investigate';
    g.target = { x, y };
    g.lookTimer = 0;
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const v = speed * (0.4 + random() * 0.8);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + random() * 0.4, max: 0.9, color, size: 2 + random() * 3 });
    }
  }

  /**
   * One fixed step. `move` is {x, y} (each -1..1, normalised by the caller);
   * `sprint` is Shift held; `throwAt` is a world point to toss a coin at, or null.
   */
  function step(dt, move, sprint, throwAt) {
    let events = 0;
    if (state.won || state.lost) return events;
    state.elapsed += dt;
    if (state.coinCooldown > 0) state.coinCooldown -= dt;
    if (state.trauma > 0) state.trauma = Math.max(0, state.trauma - 1.4 * dt);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - 2.2 * dt);

    // --- player movement ---
    const len = Math.hypot(move.x, move.y);
    player.moving = len > 0.01;
    player.sprinting = sprint && player.moving;
    if (player.moving) {
      const speed = player.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      const nx = (move.x / len) * speed * dt;
      const ny = (move.y / len) * speed * dt;
      moveCircle(player, nx, ny, PLAYER.radius);
      player.face = Math.atan2(move.y, move.x);
      if (player.sprinting) {
        state.noiseTimer -= dt;
        if (state.noiseTimer <= 0) {
          state.noiseTimer = 0.45;
          state.noise = { x: player.x, y: player.y, r: PLAYER.noiseRadius, life: 0.45 };
          for (const g of guards) {
            if (Math.hypot(g.x - player.x, g.y - player.y) < PLAYER.noiseRadius) investigate(g, player.x, player.y);
          }
        }
      }
    }
    if (state.noise) {
      state.noise.life -= dt;
      if (state.noise.life <= 0) state.noise = null;
    }

    // --- coin throw: a "ting" that lures the nearest guards ---
    if (throwAt && state.coinsLeft > 0 && state.coinCooldown <= 0) {
      const d = Math.hypot(throwAt.x - player.x, throwAt.y - player.y);
      if (d <= COIN.throwRange && !pointSolid(throwAt.x, throwAt.y)) {
        state.coinsLeft -= 1;
        state.coinCooldown = COIN.cooldown;
        state.coin = { x: throwAt.x, y: throwAt.y, ring: 0 };
        burst(throwAt.x, throwAt.y, '#ffe066', 8, 60);
        for (const g of guards) {
          if (Math.hypot(g.x - throwAt.x, g.y - throwAt.y) < COIN.noiseRadius) investigate(g, throwAt.x, throwAt.y);
        }
        events |= EVENT_COIN;
      }
    }
    if (state.coin) {
      state.coin.ring += dt * 90;
      if (state.coin.ring > COIN.noiseRadius) state.coin = null;
    }

    // --- light at the player's feet decides how fast they are spotted ---
    const light = lightAt(player.x, player.y);
    state.inShadow = light < LIGHT.ambient * 0.75;

    // --- guards: see, chase, investigate, patrol ---
    state.seen = false;
    for (const g of guards) {
      const dist = guardSees(g);
      if (dist > 0) {
        state.seen = true;
        const distFactor = GUARD.viewRange === 0 ? 1 : DETECTION.far + (DETECTION.near - DETECTION.far) * (1 - dist / GUARD.viewRange);
        const rate = (DETECTION.base + DETECTION.light * light ** 1.5) * distFactor * (player.sprinting ? DETECTION.sprintMultiplier : 1);
        state.detection = Math.min(100, state.detection + rate * dt);
        state.maxDetection = Math.max(state.maxDetection, state.detection);
        g.loseTimer = 0;
        if (state.detection >= 100 && g.state !== 'chase') {
          g.state = 'chase';
          state.alarms += 1;
          state.trauma = Math.max(state.trauma, 0.7);
          events |= EVENT_ALARM;
        }
        if (g.state === 'chase') g.target = { x: player.x, y: player.y };
        g.lastSeen = { x: player.x, y: player.y };
      } else if (g.state === 'chase') {
        g.loseTimer += dt;
        if (g.loseTimer > GUARD.chaseMemory) {
          g.state = 'investigate';
          // Search where the player was LAST SEEN, not where they are now:
          // a guard that lost sight must not know the player's position.
          g.target = g.lastSeen ? { ...g.lastSeen } : { x: g.x, y: g.y };
          state.detection = 45;
        }
      }

      if (g.state === 'patrol') {
        const wp = g.waypoints[g.wpIndex];
        const wtx = Math.floor(wp.x / TILE);
        const wty = Math.floor(wp.y / TILE);
        if (!followPath(g, wtx, wty, GUARD.patrolSpeed, dt)) {
          g.wpIndex += g.wpDir;
          if (g.wpIndex >= g.waypoints.length || g.wpIndex < 0) {
            g.wpDir *= -1;
            g.wpIndex += g.wpDir * 2;
          }
          g.path = null;
        }
      } else if (g.state === 'investigate' && g.target) {
        const ttx = Math.floor(g.target.x / TILE);
        const tty = Math.floor(g.target.y / TILE);
        if (!followPath(g, ttx, tty, GUARD.investigateSpeed, dt)) {
          g.lookTimer += dt;
          g.angle += dt * 1.6;
          if (g.lookTimer > 1.8) {
            g.state = 'patrol';
            g.target = null;
            g.lookTimer = 0;
            g.path = null;
          }
        }
      } else if (g.state === 'chase' && g.target) {
        const ttx = Math.floor(g.target.x / TILE);
        const tty = Math.floor(g.target.y / TILE);
        followPath(g, ttx, tty, GUARD.chaseSpeed, dt);
        if (Math.hypot(player.x - g.x, player.y - g.y) < GUARD.catchDistance) {
          state.lost = true;
          state.flash = 1;
          state.trauma = 1;
          events |= EVENT_OVER;
        }
      }
    }
    if (!state.seen && state.detection > 0 && !state.lost) {
      state.detection = Math.max(0, state.detection - DETECTION.decay * dt);
    }

    // --- artifacts ---
    for (const a of artifacts) {
      if (a.taken) continue;
      if (Math.hypot(player.x - a.x, player.y - a.y) < 28) {
        a.taken = true;
        state.taken += 1;
        state.score += 1000;
        burst(a.x, a.y, '#ffe066', 16, 110);
        events |= EVENT_ARTIFACT;
      }
    }

    // --- exit: only opens once all three heirlooms are stolen back ---
    if (state.taken === artifacts.length) {
      if (player.x > exit.x - 6 && player.x < exit.x + exit.w + 6 && player.y > exit.y - 6 && player.y < exit.y + exit.h + 6) {
        state.won = true;
        const timeBonus = Math.max(0, 6000 - Math.floor(state.elapsed) * 15);
        const ghostBonus = state.alarms === 0 ? 3000 : 0;
        state.score += timeBonus + ghostBonus - Math.floor(state.maxDetection) * 5;
        burst(player.x, player.y, '#3ddc84', 24, 140);
        events |= EVENT_WIN;
      }
    }

    // --- particles ---
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      if (p.life <= 0) particles.splice(i, 1);
    }
    return events;
  }

  reset();
  return { state, reset, step };
}
