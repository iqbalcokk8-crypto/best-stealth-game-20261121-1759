// BAYANG SENJA — Shadow Courier. A top-down stealth game.
// Every tuning number, colour and the whole museum layout in one place.
// The playfield is a fixed 1280x800 logical area; the renderer scales it
// to the window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 800 };
export const TILE = 40;
export const COLS = 32;
export const ROWS = 20;

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 138,
  sprintSpeed: 212,
  /** Noise radius while sprinting; walking is silent. */
  noiseRadius: 125,
};

export const GUARD = {
  radius: 14,
  patrolSpeed: 62,
  investigateSpeed: 88,
  chaseSpeed: 158,
  /** Vision cone: range in px, half-angle in radians. */
  viewRange: 205,
  viewHalfAngle: 0.61,
  /** Seconds a guard keeps chasing after losing sight. */
  chaseMemory: 2.5,
  /** Caught when a chasing guard gets this close (px). */
  catchDistance: 25,
};

export const DETECTION = {
  /** Detection fills 0..100. Rates per second at mid-range, before light. */
  base: 8,
  light: 72,
  decay: 26,
  /** Distance factor: closer fills faster. */
  near: 1.45,
  far: 0.6,
  sprintMultiplier: 1.5,
};

export const LIGHT = {
  ambient: 0.3,
  lampRadius: 155,
  lampStrength: 0.85,
  shadowMultiplier: 0.3,
};

export const COIN = { count: 3, throwRange: 340, noiseRadius: 165, cooldown: 0.5 };

/** Rects in tile units {x, y, w, h}. Walls block movement and sight. */
export const WALLS = [
  // Horizontal gallery walls, with door gaps.
  { x: 2, y: 6, w: 6, h: 1 }, { x: 9, y: 6, w: 5, h: 1 },
  { x: 18, y: 6, w: 5, h: 1 }, { x: 24, y: 6, w: 6, h: 1 },
  { x: 2, y: 13, w: 3, h: 1 }, { x: 7, y: 13, w: 7, h: 1 },
  { x: 18, y: 13, w: 7, h: 1 }, { x: 26, y: 13, w: 4, h: 1 },
  // Vertical partitions, open in the middle gallery.
  { x: 15, y: 2, w: 2, h: 3 }, { x: 15, y: 15, w: 2, h: 3 },
];

/** Crates: cover that blocks movement and sight. Rects in tile units. */
export const CRATES = [
  { x: 6, y: 4, w: 2, h: 1 }, { x: 9, y: 2, w: 1, h: 1 },
  { x: 13, y: 4, w: 1, h: 1 }, { x: 18, y: 4, w: 2, h: 1 },
  { x: 24, y: 4, w: 1, h: 2 }, { x: 4, y: 8, w: 2, h: 1 },
  { x: 9, y: 10, w: 1, h: 1 }, { x: 13, y: 9, w: 2, h: 1 },
  { x: 19, y: 8, w: 1, h: 2 }, { x: 25, y: 11, w: 2, h: 1 },
  { x: 6, y: 15, w: 2, h: 1 }, { x: 11, y: 16, w: 1, h: 1 },
  { x: 17, y: 14, w: 2, h: 1 }, { x: 23, y: 16, w: 1, h: 1 },
  { x: 27, y: 14, w: 1, h: 1 }, { x: 14, y: 11, w: 1, h: 1 },
];

/** Lamp centres in tile units; each paints a warm light pool. */
export const LAMPS = [
  { x: 5, y: 2 }, { x: 12, y: 4 }, { x: 20, y: 2 }, { x: 27, y: 4 },
  { x: 8, y: 9 }, { x: 15, y: 10 }, { x: 23, y: 9 }, { x: 28, y: 11 },
  { x: 5, y: 16 }, { x: 12, y: 15 }, { x: 20, y: 16 }, { x: 26, y: 16 },
];

/** Dark zones in tile units: standing here makes detection fill slowly. */
export const SHADOWS = [
  { x: 1, y: 1, w: 3, h: 2 }, { x: 28, y: 1, w: 3, h: 2 },
  { x: 1, y: 17, w: 3, h: 2 }, { x: 28, y: 17, w: 3, h: 2 },
  { x: 13, y: 8, w: 5, h: 3 }, { x: 21, y: 7, w: 3, h: 2 },
];

/** The three heirlooms to steal back. Tile coords. */
export const ARTIFACTS = [
  { x: 28, y: 2, kind: 'gem', name: 'Permata Senja' },
  { x: 3, y: 17, kind: 'mask', name: 'Topeng Purnama' },
  { x: 28, y: 17, kind: 'scroll', name: 'Lontar Kuno' },
];

/** The exit door: two tiles wide on the bottom gallery. */
export const EXIT = { x: 15, y: 18, w: 2, h: 1 };

export const PLAYER_START = { x: 2, y: 3 };

/** Guards: patrol waypoints in tile coords, walked in order and back. */
export const GUARDS = [
  { waypoints: [[3, 2], [8, 2]], name: 'Bowo' },
  { waypoints: [[23, 2], [28, 2]], name: 'Sari' },
  { waypoints: [[3, 10], [13, 10]], name: 'Agus' },
  { waypoints: [[18, 16], [28, 16]], name: 'Rini' },
  { waypoints: [[15, 7], [15, 12]], name: 'Dedi' },
];

export const PALETTE = {
  backdrop: '#0a0c12',
  floor: '#232838',
  floorAlt: '#202434',
  shadow: '#141824',
  wall: '#3a4157',
  wallTop: '#4d5878',
  crate: '#6b4f2a',
  crateTop: '#8a6a3b',
  lamp: '#ffd27a',
  conePatrol: 'rgba(255, 210, 90, 0.20)',
  coneSuspicious: 'rgba(255, 150, 60, 0.30)',
  coneChase: 'rgba(255, 70, 70, 0.38)',
  player: '#7dd8ff',
  playerCloak: '#2c3a55',
  guard: '#ff9d5c',
  guardUniform: '#33415e',
  exit: '#3ddc84',
  exitLocked: '#5a6b7a',
  artifact: '#ffe066',
  text: '#eef1f5',
  muted: '#9aa3b5',
  danger: '#ff5a5a',
  panel: 'rgba(13, 16, 26, 0.96)', // Opaque enough to read over the living museum.
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best (fastest ghost) time is kept between visits. */
export const BEST_KEY = 'bayang-senja.best';

/** Tile centre in pixels. */
export function tileCentre(tx, ty) {
  return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
}
