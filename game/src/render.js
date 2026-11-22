// Drawing only for BAYANG SENJA: the world's state and the current screen in,
// pixels out. The 1280x800 playfield is scaled to fit the window and centred.
// Vision cones are raycast fans, so walls and crates genuinely cut them off;
// light pools and shadow zones are painted on the floor, so the screenshot
// shows exactly what the detection rules see.
import {
  COLS, CRATES, FIELD, FONT, GUARD, LAMPS, PALETTE, PLAYER, ROWS, SHADOWS, TILE, WALLS,
  tileCentre,
} from './config.js';
import { castRay } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 660, top: 150, line: 32, bottom: 72 };

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  /** Client (CSS) coords -> world coords, for the coin throw. */
  function toWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const px = (clientX - rect.left) * ratio;
    const py = (clientY - rect.top) * ratio;
    return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  // Static layer: the floor (tiles, shadow zones, lamp pools, grid) never
  // changes, so it is painted once to an offscreen canvas and blitted each
  // frame instead of rebuilding a dozen gradients 60 times a second.
  const staticLayer = document.createElement('canvas');
  staticLayer.width = FIELD.width;
  staticLayer.height = FIELD.height;
  const vignetteLayer = document.createElement('canvas');
  vignetteLayer.width = FIELD.width;
  vignetteLayer.height = FIELD.height;
  // Red edge glow, painted once and shown while a guard sees the player:
  // the stronger the detection, the harder the screen edges burn.
  const seenLayer = document.createElement('canvas');
  seenLayer.width = FIELD.width;
  seenLayer.height = FIELD.height;
  (function paintStatic() {
    const s = staticLayer.getContext('2d');
    s.fillStyle = PALETTE.floor;
    s.fillRect(0, 0, FIELD.width, FIELD.height);
    for (let ty = 0; ty < ROWS; ty += 1) {
      for (let tx = 0; tx < COLS; tx += 1) {
        if ((tx + ty) % 2 === 0) {
          s.fillStyle = PALETTE.floorAlt;
          s.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        }
      }
    }
    for (const sh of SHADOWS) {
      s.fillStyle = PALETTE.shadow;
      s.fillRect(sh.x * TILE, sh.y * TILE, sh.w * TILE, sh.h * TILE);
    }
    for (const lamp of LAMPS) {
      const c = tileCentre(lamp.x, lamp.y);
      const grad = s.createRadialGradient(c.x, c.y, 8, c.x, c.y, 155);
      grad.addColorStop(0, 'rgba(255, 210, 122, 0.30)');
      grad.addColorStop(1, 'rgba(255, 210, 122, 0)');
      s.fillStyle = grad;
      s.beginPath();
      s.arc(c.x, c.y, 155, 0, Math.PI * 2);
      s.fill();
      s.fillStyle = '#ffe9b0';
      s.beginPath();
      s.arc(c.x, c.y, 5, 0, Math.PI * 2);
      s.fill();
    }
    s.strokeStyle = 'rgba(255,255,255,0.03)';
    s.lineWidth = 1;
    s.beginPath();
    for (let tx = 0; tx <= COLS; tx += 1) {
      s.moveTo(tx * TILE, 0);
      s.lineTo(tx * TILE, FIELD.height);
    }
    for (let ty = 0; ty <= ROWS; ty += 1) {
      s.moveTo(0, ty * TILE);
      s.lineTo(FIELD.width, ty * TILE);
    }
    s.stroke();
    const v = vignetteLayer.getContext('2d');
    const vig = v.createRadialGradient(
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.45,
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.85,
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.42)');
    v.fillStyle = vig;
    v.fillRect(0, 0, FIELD.width, FIELD.height);
    const r = seenLayer.getContext('2d');
    const red = r.createRadialGradient(
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.35,
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.8,
    );
    red.addColorStop(0, 'rgba(255,40,40,0)');
    red.addColorStop(1, 'rgba(255,40,40,0.38)');
    r.fillStyle = red;
    r.fillRect(0, 0, FIELD.width, FIELD.height);
  }());

  function drawFloor() {
    context.drawImage(staticLayer, 0, 0);
  }

  function drawCone(g) {
    const color = g.state === 'chase' ? PALETTE.coneChase
      : g.state === 'investigate' ? PALETTE.coneSuspicious : PALETTE.conePatrol;
    const rays = 26;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(g.x, g.y);
    for (let i = 0; i <= rays; i += 1) {
      const a = g.angle - GUARD.viewHalfAngle + (2 * GUARD.viewHalfAngle * i) / rays;
      const d = castRay(g.x, g.y, a, GUARD.viewRange);
      context.lineTo(g.x + Math.cos(a) * d, g.y + Math.sin(a) * d);
    }
    context.closePath();
    context.fill();
  }

  function drawExit(state, t) {
    const e = state.exit;
    const open = state.taken === state.artifacts.length;
    const pulse = 0.6 + 0.4 * Math.sin(t * 3);
    context.fillStyle = open ? `rgba(61, 220, 132, ${0.25 + 0.25 * pulse})` : 'rgba(90, 107, 122, 0.25)';
    context.fillRect(e.x, e.y, e.w, e.h);
    context.strokeStyle = open ? PALETTE.exit : PALETTE.exitLocked;
    context.lineWidth = 3;
    context.strokeRect(e.x + 2, e.y + 2, e.w - 4, e.h - 4);
    text(open ? 'KELUAR' : 'TERKUNCI', e.x + e.w / 2, e.y + e.h / 2 + 7, 17, open ? PALETTE.exit : PALETTE.muted, 'center');
    if (!open) {
      text(`${state.taken}/3`, e.x + e.w / 2, e.y - 8, 15, PALETTE.muted, 'center');
    }
  }

  function drawArtifacts(state, t) {
    for (const a of state.artifacts) {
      if (a.taken) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + a.x);
      const glow = context.createRadialGradient(a.x, a.y, 2, a.x, a.y, 34);
      glow.addColorStop(0, `rgba(255, 224, 102, ${0.45 * pulse + 0.2})`);
      glow.addColorStop(1, 'rgba(255, 224, 102, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(a.x, a.y, 34, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.artifact;
      if (a.kind === 'gem') {
        context.beginPath();
        context.moveTo(a.x, a.y - 12);
        context.lineTo(a.x + 10, a.y);
        context.lineTo(a.x, a.y + 12);
        context.lineTo(a.x - 10, a.y);
        context.closePath();
        context.fill();
      } else if (a.kind === 'mask') {
        context.beginPath();
        context.arc(a.x, a.y, 11, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#7a5c00';
        context.beginPath();
        context.arc(a.x - 4, a.y - 2, 2.5, 0, Math.PI * 2);
        context.arc(a.x + 4, a.y - 2, 2.5, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(a.x - 9, a.y - 6, 18, 12);
        context.strokeStyle = '#7a5c00';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(a.x - 5, a.y - 2);
        context.lineTo(a.x + 5, a.y - 2);
        context.moveTo(a.x - 5, a.y + 2);
        context.lineTo(a.x + 5, a.y + 2);
        context.stroke();
      }
    }
  }

  function drawSolids() {
    for (const w of WALLS) {
      context.fillStyle = PALETTE.wall;
      context.fillRect(w.x * TILE, w.y * TILE, w.w * TILE, w.h * TILE);
      context.fillStyle = PALETTE.wallTop;
      context.fillRect(w.x * TILE, w.y * TILE, w.w * TILE, 5);
    }
    // Border walls.
    context.fillStyle = PALETTE.wall;
    context.fillRect(0, 0, FIELD.width, TILE);
    context.fillRect(0, FIELD.height - TILE, FIELD.width, TILE);
    context.fillRect(0, 0, TILE, FIELD.height);
    context.fillRect(FIELD.width - TILE, 0, TILE, FIELD.height);
    context.fillStyle = PALETTE.wallTop;
    context.fillRect(0, TILE - 5, FIELD.width, 5);
    for (const c of CRATES) {
      const x = c.x * TILE;
      const y = c.y * TILE;
      const w = c.w * TILE;
      const h = c.h * TILE;
      context.fillStyle = PALETTE.crate;
      context.fillRect(x, y, w, h);
      context.fillStyle = PALETTE.crateTop;
      context.fillRect(x, y, w, 6);
      context.strokeStyle = '#4a3419';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x + 3, y + 3);
      context.lineTo(x + w - 3, y + h - 3);
      context.moveTo(x + w - 3, y + 3);
      context.lineTo(x + 3, y + h - 3);
      context.stroke();
    }
  }

  function drawGuards(state, t) {
    for (const g of state.guards) {
      // Body.
      context.fillStyle = PALETTE.guardUniform;
      context.beginPath();
      context.arc(g.x, g.y, GUARD.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.guard;
      context.beginPath();
      context.arc(g.x, g.y, 8, 0, Math.PI * 2);
      context.fill();
      // Facing tick.
      context.strokeStyle = PALETTE.guard;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(g.x + Math.cos(g.angle) * 10, g.y + Math.sin(g.angle) * 10);
      context.lineTo(g.x + Math.cos(g.angle) * 20, g.y + Math.sin(g.angle) * 20);
      context.stroke();
      // Name + state mark.
      text(g.name, g.x, g.y - GUARD.radius - 8, 12, PALETTE.muted, 'center');
      if (g.state === 'chase') {
        text('!', g.x, g.y - GUARD.radius - 22, 22, PALETTE.danger, 'center');
      } else if (g.state === 'investigate') {
        text('?', g.x, g.y - GUARD.radius - 22, 20, '#ffb03a', 'center');
      }
      void t;
    }
  }

  function drawPlayer(state, t) {
    const p = state.player;
    const ring = state.seen ? PALETTE.danger : state.inShadow ? '#8ef0c0' : PALETTE.player;
    if (state.inShadow) {
      context.strokeStyle = 'rgba(142, 240, 192, 0.5)';
      context.lineWidth = 2;
      context.setLineDash([4, 5]);
      context.beginPath();
      context.arc(p.x, p.y, PLAYER.radius + 7, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
    }
    context.fillStyle = PALETTE.playerCloak;
    context.beginPath();
    context.arc(p.x, p.y, PLAYER.radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(p.x + Math.cos(p.face) * 4, p.y + Math.sin(p.face) * 4, 7, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = ring;
    context.lineWidth = 2.5;
    context.beginPath();
    context.arc(p.x, p.y, PLAYER.radius + 2, 0, Math.PI * 2);
    context.stroke();
    void t;
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.max);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawNoise(state) {
    if (state.noise) {
      context.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(state.noise.x, state.noise.y, state.noise.r * (1 - state.noise.life / 0.45) + 10, 0, Math.PI * 2);
      context.stroke();
    }
    if (state.coin) {
      context.strokeStyle = 'rgba(255, 224, 102, 0.8)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(state.coin.x, state.coin.y, state.coin.ring, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = PALETTE.artifact;
      context.beginPath();
      context.arc(state.coin.x, state.coin.y, 5, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawHud(state) {
    context.fillStyle = 'rgba(10, 12, 18, 0.72)';
    context.fillRect(0, 0, FIELD.width, 46);
    // Artifacts.
    for (let i = 0; i < 3; i += 1) {
      context.fillStyle = i < state.taken ? PALETTE.artifact : 'rgba(255,255,255,0.18)';
      context.beginPath();
      context.arc(28 + i * 30, 23, 9, 0, Math.PI * 2);
      context.fill();
    }
    text(`${state.taken}/3 pusaka`, 108, 29, 18, PALETTE.text, 'left');
    // Coins.
    text(`Koin ${state.coinsLeft}`, 240, 29, 18, PALETTE.text, 'left');
    // Detection eye, centre.
    const cx = FIELD.width / 2;
    const det = state.detection / 100;
    context.fillStyle = 'rgba(255,255,255,0.15)';
    context.fillRect(cx - 130, 14, 260, 18);
    context.fillStyle = det < 0.5 ? '#ffd25a' : det < 0.85 ? '#ff9d3c' : PALETTE.danger;
    context.fillRect(cx - 130, 14, 260 * det, 18);
    context.strokeStyle = 'rgba(255,255,255,0.4)';
    context.lineWidth = 1;
    context.strokeRect(cx - 130, 14, 260, 18);
    text(state.seen ? 'TERLIHAT!' : state.inShadow ? 'BAYANGAN — aman' : 'Mata penjaga', cx, 8, 13, state.seen ? PALETTE.danger : PALETTE.muted, 'center');
    // Timer + score, right.
    text(fmtTime(state.elapsed), FIELD.width - 268, 29, 18, PALETTE.text, 'left');
    text(`Skor ${state.score}`, FIELD.width - 24, 29, 18, PALETTE.text, 'right');
    // Hints along the bottom.
    text('WASD / panah: bergerak   •   Shift: lari (berisik!)   •   Klik: lempar koin   •   P: jeda', FIELD.width / 2, FIELD.height - 12, 15, PALETTE.muted, 'center');
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = accent || 'rgba(255,255,255,0.15)';
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    text(title, FIELD.width / 2, y + 76, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 23, PALETTE.artifact, 'center');
  }

  const TITLE_LINES = [
    'Museum Senja, tengah malam. Tiga pusaka dicuri — dan hanya',
    'kamu, sang kurir bayangan, yang bisa mengambilnya kembali.',
    '',
    'Bersembunyi di bayangan: di sana mata penjaga hampir buta.',
    'Di bawah lampu, kamu terlihat dalam sekejap. Berlari itu berisik —',
    'penjaga akan datang memeriksa. Lempar koin untuk memancing mereka pergi.',
    '',
    'Ambil 3 pusaka, lalu keluar lewat pintu hijau. Jangan sampai tertangkap.',
  ];
  const WIN_LINES = ['', '', '', ''];
  const OVER_LINES = ['Langkahmu terdengar. Cahaya lampu mengkhianatimu.', 'Para penjaga tidak pernah benar-benar tidur.'];

  /** Paint one frame. `best` is the best score so far (title screen). */
  function draw(state, screen, best) {
    const t = performance.now() / 1000;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Trauma shake: the camera itself shakes, never the simulation.
    const shake = state.trauma * state.trauma * 10;
    const sx = shake ? Math.sin(t * 47) * shake : 0;
    const sy = shake ? Math.cos(t * 39) * shake : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + sx * view.scale, view.y + sy * view.scale);
    drawFloor();
    for (const g of state.guards) drawCone(g);
    drawExit(state, t);
    drawArtifacts(state, t);
    drawSolids();
    drawGuards(state, t);
    drawPlayer(state, t);
    drawParticles(state);
    drawNoise(state);
    // Red flash when caught.
    if (state.flash > 0) {
      context.fillStyle = `rgba(255, 40, 40, ${state.flash * 0.25})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    // Red edge glow while a guard sees the player, scaled by detection.
    if (state.seen && state.detection > 0) {
      context.globalAlpha = Math.min(1, state.detection / 70);
      context.drawImage(seenLayer, 0, 0);
      context.globalAlpha = 1;
    }
    // Vignette: the museum at night (pre-rendered, blitted).
    context.drawImage(vignetteLayer, 0, 0);

    if (screen === SCREEN_TITLE) {
      drawPanel('BAYANG SENJA', TITLE_LINES, 'Tekan Spasi atau klik untuk mulai');
      text(`Skor terbaik: ${best}`, FIELD.width / 2, 682, 18, PALETTE.muted, 'center');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Jeda', ['Para penjaga menunggu dalam gelap.'], 'Tekan P untuk lanjut');
    } else if (screen === SCREEN_OVER) {
      drawPanel('TERTANGKAP!', OVER_LINES, 'Tekan Spasi untuk mencoba lagi', PALETTE.danger);
    } else if (screen === SCREEN_WIN) {
      WIN_LINES[0] = `Waktu ${fmtTime(state.elapsed)}   •   Skor ${state.score}`;
      WIN_LINES[1] = state.alarms === 0 ? 'GHOST — tidak satu pun alarm berbunyi. Sempurna.' : `Alarm berbunyi ${state.alarms}x — lain kali, lebih senyap.`;
      WIN_LINES[2] = `Deteksi tertinggi ${Math.floor(state.maxDetection)}%   •   Pusaka 3/3`;
      WIN_LINES[3] = '';
      drawPanel('LOLOS TANPA TERLIHAT!', WIN_LINES, 'Tekan Spasi untuk main lagi', PALETTE.exit);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toWorld };
}
