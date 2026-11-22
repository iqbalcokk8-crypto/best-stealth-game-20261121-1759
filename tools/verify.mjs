// BAYANG SENJA — final regression tests (audit R1, ChatGPT priorities 2 + 5).
// Every check prints a MEASURED number; nothing is claimed without one.
// Run: node tools/verify.mjs
import { createWorld, hasLOS, castRay, lightAt, findPath, tileSolid, EVENT_ALARM, EVENT_OVER, EVENT_WIN } from '../game/src/world.js';
import { createRandom } from '../game/src/random.js';
import { STEP, TILE, tileCentre, GUARD } from '../game/src/config.js';

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  if (!ok) failures += 1;
}

const w = createWorld(createRandom(7));
const S = () => w.state;

// --- 1. Raycast: a wall/crate cuts the cone; open floor does not ---
{
  // East from (3,3): the vertical wall x15 (face px 600) stops the ray at ~460px.
  const g = tileCentre(3, 3);
  const dWall = castRay(g.x, g.y, 0, 700);
  check('raycast stops at wall', dWall > 440 && dWall < 480, `east ray from (3,3) = ${dWall.toFixed(0)}px (wall face 460px away)`);
  // East from the open middle gallery (15,10): nothing for 300px.
  const open = tileCentre(15, 10);
  const dOpen = castRay(open.x, open.y, 0, 300);
  check('raycast open floor reaches range', Math.abs(dOpen - 300) < 1, `east ray from (15,10) = ${dOpen.toFixed(0)}px (full 300, no wall)`);
  // South from the same spot: the vertical wall x15-16, y15-17 stops it at ~180px.
  const dSouth = castRay(open.x, open.y, Math.PI / 2, 300);
  check('raycast stops at wall (south)', dSouth > 170 && dSouth < 190, `south ray from (15,10) = ${dSouth.toFixed(0)}px (wall face 180px away)`);
  // LOS: player behind the horizontal wall y=6 from a guard above it.
  w.reset();
  const guard = S().guards[2]; // Agus, patrols row 10
  guard.x = tileCentre(5, 5).x; guard.y = tileCentre(5, 5).y; guard.angle = Math.PI / 2; // facing south, wall y=6 between
  S().player.x = tileCentre(5, 8).x; S().player.y = tileCentre(5, 8).y;
  const losBlocked = hasLOS(guard.x, guard.y, S().player.x, S().player.y);
  S().player.y = tileCentre(5, 5).y + 15; // same side of the wall, 15px away
  const losOpen = hasLOS(guard.x, guard.y, S().player.x, S().player.y);
  check('LOS blocked by wall', losBlocked === false && losOpen === true, `through wall y=6: ${losBlocked}, same side: ${losOpen}`);
}

// --- 2. Detection: lamp light vs shadow, measured over 1s in-cone ---
function detectionAfter(seconds, px, py, gx, gy, angle) {
  w.reset();
  // Park every guard frozen at its spawn, facing west, so only the test
  // guard can see the player.
  for (const g of S().guards) {
    g.waypoints = [{ x: g.x, y: g.y }, { x: g.x, y: g.y }];
    g.angle = Math.PI;
  }
  const g = S().guards[0];
  g.x = gx; g.y = gy; g.angle = angle;
  g.waypoints = [{ x: gx, y: gy }, { x: gx, y: gy }];
  S().player.x = px; S().player.y = py;
  for (let i = 0; i < seconds / STEP; i += 1) w.step(STEP, { x: 0, y: 0 }, false, null);
  return S().detection;
}
{
  // Guard at lamp (5,2) facing east; player right under the lamp, 40px ahead.
  const lampC = tileCentre(5, 2);
  const dLamp = detectionAfter(1, lampC.x + 40, lampC.y, lampC.x, lampC.y, 0);
  // Same geometry in the shadow corner (28,17): guard at (26,17) facing
  // east, player at (29,17) inside the dark zone.
  const shG = tileCentre(26, 17);
  const dShadow = detectionAfter(1, shG.x + 120, shG.y, shG.x, shG.y, 0);
  const ratio = dLamp / Math.max(dShadow, 0.01);
  check('detection lamp vs shadow', dLamp > 50 && dShadow < 25 && ratio > 3, `lamp 1s = ${dLamp.toFixed(1)}, shadow 1s = ${dShadow.toFixed(1)}, ratio ${ratio.toFixed(1)}x (light under lamp ${lightAt(lampC.x + 40, lampC.y).toFixed(2)} vs shadow ${lightAt(shG.x + 120, shG.y).toFixed(2)})`);
}

// --- 3. Coin throw lures a guard into investigate ---
{
  w.reset();
  const g = S().guards[0]; // Bowo near (3,2)
  const before = g.state;
  const coinAt = tileCentre(6, 2);
  w.step(STEP, { x: 0, y: 0 }, false, coinAt);
  const after = g.state;
  const distToCoin = g.target ? Math.hypot(g.target.x - coinAt.x, g.target.y - coinAt.y).toFixed(0) : 'none';
  check('coin triggers investigate', before === 'patrol' && after === 'investigate', `guard ${before} -> ${after}, target ${distToCoin}px from coin, coinsLeft ${S().coinsLeft}`);
}

// --- 4. Chase can be broken: alarm, hide behind wall in shadow, guard gives up ---
{
  w.reset();
  const g = S().guards[0];
  // Park the other guards frozen in the far bottom-right corner, away from
  // the flee route, so only guard 0 is in play.
  const park = tileCentre(29, 18);
  for (let i = 1; i < S().guards.length; i += 1) {
    const o = S().guards[i];
    o.x = park.x; o.y = park.y;
    o.waypoints = [{ x: park.x, y: park.y }, { x: park.x, y: park.y }];
    o.angle = Math.PI;
  }
  // Player in lamp cone until alarm fires.
  const lampC = tileCentre(5, 2);
  S().player.x = lampC.x + 120; S().player.y = lampC.y;
  g.x = lampC.x; g.y = lampC.y; g.angle = 0;
  g.waypoints = [{ x: lampC.x, y: lampC.y }, { x: lampC.x, y: lampC.y }];
  let alarmed = false;
  for (let i = 0; i < 5 / STEP && !alarmed; i += 1) {
    const ev = w.step(STEP, { x: 0, y: 0 }, false, null);
    if (ev & EVENT_ALARM) alarmed = true;
  }
  // Flee in two stages with real pathfinding (Dijkstra, same as the autopilot):
  // first south through the door gap into the middle gallery (away from
  // the guard), then to the dark corner (1,17). The wall y=13 breaks line
  // of sight on the way, so the chase must die and the guard must return
  // to patrol.
  let caught = false;
  let gaveUp = false;
  let stage = 0;
  let path = null;
  let pathTimer = 0;
  for (let i = 0; i < 16 / STEP; i += 1) {
    const p = S().player;
    const target = stage === 0 ? [8, 10] : [1, 17];
    pathTimer -= STEP;
    if (!path || pathTimer <= 0) {
      path = findPath(Math.floor(p.x / TILE), Math.floor(p.y / TILE), target[0], target[1], 0);
      pathTimer = 0.5;
    }
    let move = { x: 0, y: 0 };
    if (path && path.length > 0) {
      const dest = tileCentre(path[0][0], path[0][1]);
      const dx = dest.x - p.x;
      const dy = dest.y - p.y;
      if (Math.hypot(dx, dy) < 8) path.shift();
      else {
        const len = Math.hypot(dx, dy);
        move = { x: dx / len, y: dy / len };
      }
    } else if (stage === 0) {
      stage = 1;
      path = null;
    }
    const ev = w.step(STEP, move, true, null);
    if (ev & EVENT_OVER) { caught = true; break; }
    if (g.state === 'patrol' && S().detection < 45) { gaveUp = true; break; }
  }
  check('chase can be broken', alarmed && !caught && gaveUp, `alarmed=${alarmed} caught=${caught} guard back to ${g.state}, detection ${S().detection.toFixed(0)}`);
}

// --- 5. Guard states have different speeds (measured displacement) ---
{
  w.reset();
  const g = S().guards[0];
  const x0 = g.x;
  for (let i = 0; i < 1 / STEP; i += 1) w.step(STEP, { x: 0, y: 0 }, false, null);
  const patrolSpeed = Math.abs(g.x - x0); // ~62 px/s
  check('guard patrol speed', patrolSpeed > 40 && patrolSpeed < 80, `patrol displacement in 1s = ${patrolSpeed.toFixed(0)}px (tuned 62)`);
}

// --- 7. Perimeter: every physically walkable tile is in the pathfinder's graph ---
{
  let walkable = 0;
  for (let ty = 0; ty < 20; ty += 1) {
    for (let tx = 0; tx < 32; tx += 1) {
      if (!tileSolid(tx, ty)) walkable += 1;
    }
  }
  // Flood-fill over walkable tiles from the player start.
  const seen = new Set(['2,3']);
  const queue = [[2, 3]];
  let connected = 0;
  while (queue.length > 0) {
    const [cx, cy] = queue.shift();
    connected += 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= 32 || ny >= 20) continue;
      if (tileSolid(nx, ny)) continue;
      const k = `${nx},${ny}`;
      if (!seen.has(k)) { seen.add(k); queue.push([nx, ny]); }
    }
  }
  // And the pathfinder itself must reach every perimeter tile (the old
  // bug: 100 of them were excluded from its graph).
  let perimeterReached = 0;
  let perimeterTotal = 0;
  for (let tx = 0; tx < 32; tx += 1) {
    for (const ty of [0, 19]) {
      if (tileSolid(tx, ty)) continue;
      perimeterTotal += 1;
      if (findPath(2, 3, tx, ty, 0)) perimeterReached += 1;
    }
  }
  for (let ty = 1; ty < 19; ty += 1) {
    for (const tx of [0, 31]) {
      if (tileSolid(tx, ty)) continue;
      perimeterTotal += 1;
      if (findPath(2, 3, tx, ty, 0)) perimeterReached += 1;
    }
  }
  check('all walkable tiles reachable', walkable === 560 && connected === walkable && perimeterReached === perimeterTotal, `walkable ${walkable}, flood-fill connected ${connected}, perimeter tiles reached by findPath ${perimeterReached}/${perimeterTotal} (was 0/100 before the fix)`);
}

// --- 8. Guard investigates a perimeter target behind a wall (ChatGPT R3 case) ---
{
  w.reset();
  const park = tileCentre(29, 18);
  for (let i = 1; i < S().guards.length; i += 1) {
    const o = S().guards[i];
    o.x = park.x; o.y = park.y;
    o.waypoints = [{ x: park.x, y: park.y }, { x: park.x, y: park.y }];
  }
  S().player.x = tileCentre(1, 1).x; S().player.y = tileCentre(1, 1).y;
  const g = S().guards[0];
  g.x = tileCentre(5, 10).x; g.y = tileCentre(5, 10).y;
  g.state = 'investigate';
  g.target = { x: tileCentre(5, 0).x, y: tileCentre(5, 0).y };
  g.lookTimer = 0;
  let arrived = false;
  let inSolid = false;
  for (let i = 0; i < 14 / STEP; i += 1) {
    w.step(STEP, { x: 0, y: 0 }, false, null);
    if (tileSolid(Math.floor(g.x / TILE), Math.floor(g.y / TILE))) inSolid = true;
    if (g.state === 'patrol') { arrived = true; break; }
  }
  check('guard reaches perimeter target', arrived && !inSolid, `guard (5,10) -> (5,0) behind wall y=6: arrived=${arrived}, ever in solid tile=${inSolid}`);
}

// --- 9. Guard walks around a wall to reach a thrown coin ---
{
  w.reset();
  const park = tileCentre(29, 18);
  for (let i = 1; i < S().guards.length; i += 1) {
    const o = S().guards[i];
    o.x = park.x; o.y = park.y;
    o.waypoints = [{ x: park.x, y: park.y }, { x: park.x, y: park.y }];
  }
  const g = S().guards[0];
  g.x = tileCentre(5, 5).x; g.y = tileCentre(5, 5).y; g.angle = Math.PI / 2; // facing south, away from the player
  S().player.x = tileCentre(5, 3).x; S().player.y = tileCentre(5, 3).y;
  const coinAt = { x: tileCentre(3, 8).x, y: tileCentre(3, 8).y }; // behind wall y=6 (crates sit at (4,8)-(5,8), so the coin lands at (3,8))
  w.step(STEP, { x: 0, y: 0 }, false, coinAt);
  const investigating = g.state === 'investigate';
  let arrived = false;
  let inSolid = false;
  for (let i = 0; i < 14 / STEP && !arrived; i += 1) {
    w.step(STEP, { x: 0, y: 0 }, false, null);
    if (tileSolid(Math.floor(g.x / TILE), Math.floor(g.y / TILE))) inSolid = true;
    if (investigating && g.state === 'patrol') arrived = true;
  }
  check('guard reaches coin behind wall', investigating && arrived && !inSolid, `coin (3,8) behind wall y=6: investigate=${investigating}, arrived=${arrived}, ever in solid tile=${inSolid}`);
}

// --- 10. No guard ever stands inside a solid tile (30s of patrol) ---
{
  w.reset();
  S().player.x = tileCentre(1, 17).x; S().player.y = tileCentre(1, 17).y;
  let inSolid = 0;
  for (let i = 0; i < 30 / STEP; i += 1) {
    w.step(STEP, { x: 0, y: 0 }, false, null);
    for (const g of S().guards) {
      if (tileSolid(Math.floor(g.x / TILE), Math.floor(g.y / TILE))) inSolid += 1;
    }
  }
  check('guards never in solid tiles', inSolid === 0, `30s patrol, ${S().guards.length} guards: ${inSolid} solid-tile samples`);
}

// --- 11. Controlled detection: same distance (40px) and direction, lamp vs shadow ---
{
  // Find a shadow pair with the same geometry as the lamp test: guard
  // facing east, player 40px ahead, player in real darkness (light < 0.15).
  let shadowPair = null;
  for (let gy = 0; gy < 20 && !shadowPair; gy += 1) {
    for (let gx = 0; gx < 30 && !shadowPair; gx += 1) {
      if (tileSolid(gx, gy) || tileSolid(gx + 1, gy)) continue;
      const px = tileCentre(gx, gy).x + 40;
      const py = tileCentre(gx, gy).y;
      if (lightAt(px, py) < 0.15) shadowPair = { gx, gy };
    }
  }
  const lampC = tileCentre(5, 2);
  const dLamp = detectionAfter(1, lampC.x + 40, lampC.y, lampC.x, lampC.y, 0);
  const shC = tileCentre(shadowPair.gx, shadowPair.gy);
  const dShadow = detectionAfter(1, shC.x + 40, shC.y, shC.x, shC.y, 0);
  const ratio = dLamp / Math.max(dShadow, 0.01);
  check('controlled detection ratio', ratio > 4, `same 40px east-facing geometry: lamp ${dLamp.toFixed(1)}/s vs shadow ${dShadow.toFixed(1)}/s (tile ${shadowPair.gx},${shadowPair.gy}), ratio ${ratio.toFixed(2)}x`);
}
{
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  let refs = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(html|js|css|json)$/.test(f.name)) {
        const t = readFileSync(p, 'utf8');
        for (const m of t.matchAll(/https?:\/\/[^\s"'<>]+/g)) refs.push(`${p}: ${m[0]}`);
      }
    }
  };
  walk('game');
  check('no network references', refs.length === 0, refs.length ? refs.slice(0, 3).join(' | ') : 'game/ loads nothing over the network');
}

console.log(failures === 0 ? 'ALL VERIFY TESTS PASSED' : `${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
