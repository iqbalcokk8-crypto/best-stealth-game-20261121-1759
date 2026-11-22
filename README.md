# BAYANG SENJA — Shadow Courier

A top-down stealth game for the make.fun bounty
`best-stealth-game-20261121-1759`. Museum Senja, tengah malam: steal back
three stolen heirlooms and reach the green exit unseen.

## The distinctive mechanic: light is the enemy

- **Light & shadow.** Lamp pools are bright: a guard's vision cone fills
  the detection eye in about a second under a lamp, but only slowly in the
  dark. Shadow zones are the safe lanes — the level is a puzzle of moving
  from shadow to shadow behind the guards' patrols.
- **Noise.** Walking is silent. Sprinting (Shift) is fast but loud: guards
  inside the noise ring come to investigate where they heard you.
- **Coin lure.** Click to toss one of 3 coins; the "ting" pulls nearby
  guards to the landing spot, opening a gap in the patrol.
- **Vision cones with real line of sight.** Walls and crates cut the cones
  off — what you see in the screenshot is exactly what the guards see.

## How to play

- **WASD / arrow keys** — move. **Shift** — sprint (loud!). **Click** —
  throw a coin to lure a guard. **P** — pause.
- Collect all 3 heirlooms (Permata Senja, Topeng Purnama, Lontar Kuno),
  then reach the green KELUAR door. If the detection eye fills, a guard
  chases you — break line of sight and hide in the dark until it forgets.
- Caught = game over. Escaping without a single alarm earns the GHOST bonus.

## Run it

```sh
node serve.ts   # serves game/ on http://localhost:8080
```

Open `http://localhost:8080` in desktop Chrome. No network requests, no
build step: `game/` is plain static files (HTML + ES modules + canvas).

## Screenshots

`shots.json` lists the four staged scenes (`?shot=title|play|alert|win`),
each played forward through the real rules by a Dijkstra autopilot in
`game/src/shots.js`. Regenerate with `node tools/shots.mjs <repo>`.
