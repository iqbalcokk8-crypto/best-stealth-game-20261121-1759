// The screenshot scenes behind ?shot=title|play|alert|win. Each one plays the
// real rules forward from a fresh world, steered by a Dijkstra autopilot that
// replans around the guards' vision cones, waits in the shadows when the
// detection meter climbs, and walks the real route to the artifacts and the
// exit — so every frame is what a short game really looks like, and the same
// seed always gives the same frame.
import { GUARD, STEP, TILE, tileCentre } from './config.js';
import {
  EVENT_ALARM, EVENT_OVER, EVENT_WIN, findPath, hasLOS,
} from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

/** True when a guard could spot someone standing on this tile right now. */
function tileDangerous(state, tx, ty) {
  const c = tileCentre(tx, ty);
  for (const g of state.guards) {
    const dx = c.x - g.x;
    const dy = c.y - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist > GUARD.viewRange) continue;
    let diff = Math.atan2(dy, dx) - g.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > GUARD.viewHalfAngle) continue;
    if (hasLOS(g.x, g.y, c.x, c.y)) return true;
  }
  return false;
}

/** Dijkstra over walkable tiles; dangerous tiles cost far more, so the pilot goes around cones. */
function findPilotPath(state, fromTx, fromTy, toTx, toTy, dare) {
  return findPath(fromTx, fromTy, toTx, toTy, dare ? 0 : (x, y) => (tileDangerous(state, x, y) ? 9 : 0));
}

/** The pilot: where to stand next, as a tile. */
function pickObjective(state) {
  // Detection climbing: fall back to the nearest dark corner and wait it out.
  if (state.detection > 55) {
    const px = Math.floor(state.player.x / TILE);
    const py = Math.floor(state.player.y / TILE);
    const hideouts = [[2, 2], [29, 2], [2, 18], [29, 18], [15, 9]];
    let best = hideouts[0];
    let bestD = Infinity;
    for (const h of hideouts) {
      const d = Math.abs(h[0] - px) + Math.abs(h[1] - py);
      if (d < bestD && !tileDangerous(state, h[0], h[1])) { bestD = d; best = h; }
    }
    return { tx: best[0], ty: best[1], waiting: true };
  }
  for (const a of state.artifacts) {
    if (!a.taken) return { tx: Math.floor(a.x / TILE), ty: Math.floor(a.y / TILE), waiting: false };
  }
  return { tx: 15, ty: 18, waiting: false };
}

function autopilot(world, dare) {
  const state = world.state;
  const px = Math.floor(state.player.x / TILE);
  const py = Math.floor(state.player.y / TILE);
  const obj = pickObjective(state);
  if (obj.waiting && state.detection > 20) {
    // Stand still in the dark until the eye forgets.
    if (px === obj.tx && py === obj.ty) return { x: 0, y: 0 };
  }
  const path = findPilotPath(state, px, py, obj.tx, obj.ty, dare);
  if (!path || path.length === 0) return { x: 0, y: 0 };
  const [nx, ny] = path[0];
  const c = tileCentre(nx, ny);
  const dx = c.x - state.player.x;
  const dy = c.y - state.player.y;
  if (Math.hypot(dx, dy) < 5) return { x: 0, y: 0 };
  // Wait out a cone crossing this tile rather than walking into it.
  if (!dare && tileDangerous(state, nx, ny) && !tileDangerous(state, px, py) && state.detection < 40) {
    return { x: 0, y: 0 };
  }
  const len = Math.hypot(dx, dy);
  return { x: dx / len, y: dy / len };
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. title: guards patrol behind the title card.
 * play: mid-heist, one heirloom taken. alert: caught in a lamp pool, the eye
 * nearly full. win: the whole heist, played for real.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'alert' && name !== 'win') {
    for (let i = 0; i < 3 / STEP; i += 1) world.step(STEP, { x: 0, y: 0 }, false, null);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const dare = name === 'alert';
  const limit = name === 'win' ? 300 : name === 'alert' ? 60 : 50;
  let events = 0;
  for (let i = 0; i < limit / STEP; i += 1) {
    // The alert scene: walk straight at the nearest guard and stand in
    // their lamp-lit cone until the eye is nearly full — the moment just
    // before the alarm. The pilot holds still once close, so the guard
    // turns, spots the player, and the meter climbs for real.
    let move = autopilot(world, dare);
    if (name === 'alert') {
      const p = world.state.player;
      let nearest = null;
      let nearestD = Infinity;
      for (const g of world.state.guards) {
        const d = Math.hypot(g.x - p.x, g.y - p.y);
        if (d < nearestD) { nearestD = d; nearest = g; }
      }
      if (nearest && world.state.detection < 62) {
        if (nearestD > 120) {
          const len = Math.hypot(nearest.x - p.x, nearest.y - p.y);
          move = { x: (nearest.x - p.x) / len, y: (nearest.y - p.y) / len };
        } else {
          move = { x: 0, y: 0 };
        }
      }
    }
    events = world.step(STEP, move, false, null);
    if (events & EVENT_OVER) return { screen: SCREEN_OVER, best: world.state.score };
    if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score };
    if (name === 'alert' && world.state.detection >= 62) {
      return { screen: SCREEN_PLAY, best: world.state.score };
    }
    if (name === 'play' && world.state.taken >= 1 && world.state.elapsed > 10) {
      return { screen: SCREEN_PLAY, best: world.state.score };
    }
    void EVENT_ALARM;
  }
  return { screen: SCREEN_PLAY, best: world.state.score };
}
