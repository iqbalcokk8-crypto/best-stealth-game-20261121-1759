// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play,
// paused, caught and escaped.
//
// ?seed=N fixes the random pattern. ?shot=title|play|alert|win (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_ALARM, EVENT_ARTIFACT, EVENT_COIN, EVENT_OVER, EVENT_WIN,
} from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import {
  createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

// --- tiny WebAudio synth: no sound files, no network ---
let audio = null;
function ensureAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}
function tone(freq, dur, type, gain, when = 0) {
  if (!audio) return;
  try {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, audio.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + when + dur);
    osc.connect(g);
    g.connect(audio.destination);
    osc.start(audio.currentTime + when);
    osc.stop(audio.currentTime + when + dur);
  } catch {
    // Sound is garnish; a failure here must never break the game.
  }
}
function soundFor(events) {
  if (events & EVENT_ARTIFACT) { tone(880, 0.18, 'sine', 0.16); tone(1318, 0.3, 'sine', 0.14, 0.09); }
  if (events & EVENT_COIN) tone(1568, 0.12, 'triangle', 0.12);
  if (events & EVENT_ALARM) { tone(220, 0.25, 'sawtooth', 0.16); tone(233, 0.25, 'sawtooth', 0.16, 0.16); }
  if (events & EVENT_WIN) { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'sine', 0.15, i * 0.12)); }
  if (events & EVENT_OVER) tone(98, 0.5, 'sawtooth', 0.2);
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let stepTimer = 0; // Footstep ticks: soft thud while walking, faster when sprinting.
  // Debug handle for the playtest script (and the curious): live state.
  window.__bayang = { get state() { return world.state; }, get screen() { return screen; } };

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    ensureAudio();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Steal the three heirlooms, then reach the green exit unseen.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won
      ? `Escaped! Score ${world.state.score}. Best ${best}.`
      : `Caught. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    // Judge the click by the screen at the START of the frame: a click
    // that lands on the same frame as a Space press is still a menu click,
    // so it is consumed here and can never leak into play as a coin throw.
    const wasMenu = screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN;
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && wasMenu) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    // A click starts (or restarts) the game from a menu screen — the title
    // promises "Spasi atau klik untuk mulai" — and the click is consumed
    // here, so it can never leak into play as a first coin throw.
    if (wasMenu && input.hasClick()) {
      input.takeClick();
      if (screen !== SCREEN_PLAY) startGame();
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The museum lives behind the title card: guards patrol, nothing scores.
      world.step(STEP, { x: 0, y: 0 }, false, null);
      return;
    }
    const click = input.takeClick();
    const throwAt = click ? renderer.toWorld(click.x, click.y) : null;
    const events = world.step(STEP, input.move(), input.sprinting(), throwAt);
    soundFor(events);
    if (screen === SCREEN_PLAY && world.state.player.moving) {
      stepTimer -= STEP;
      if (stepTimer <= 0) {
        stepTimer = world.state.player.sprinting ? 0.26 : 0.38;
        tone(world.state.player.sprinting ? 150 : 120, 0.06, 'sine', 0.05);
      }
    }
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_OVER) endGame(false);
    else if (events & EVENT_ALARM) announce('Alarm! A guard is chasing you!');
    else if (events & EVENT_ARTIFACT) announce(`Heirloom taken. ${world.state.taken} of 3.`);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting guards hunt unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Bayang Senja. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
