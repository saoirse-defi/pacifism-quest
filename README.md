# Against All Odds

A neon arcade survival game for the browser. Your energy weapons are down: the only way to thin the
ever-growing alien horde is to fly through the centre of drifting gates, which destroy every enemy
nearby. Collect the gems they leave behind to raise your multiplier, and avoid the mines at each end
of a gate.

A rebuild of [milestone2-vanilla](https://github.com/saoirse-defi/milestone2-vanilla) in
**Phaser 4 + TypeScript + Vite**.

## Running it

```sh
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build
```

`dist/` is a static site with relative paths, so it can be hosted anywhere (GitHub Pages, Netlify, itch.io).

## Controls

| | Desktop | Xbox controller | Touch |
|---|---|---|---|
| Steer | Move the mouse; the ship chases the cursor | Left stick; tilt sets speed | Drag anywhere; the ship moves relative to your finger, so it is never hidden under it |
| Start | `S` / `Enter` / `Space` or START | A or Menu | Tap START |
| Difficulty | `←` `→` | D-pad or LB / RB | Tap `<` `>` |
| Background | `B` | X | Tap BACKGROUND |
| Pause | `P` / `Esc` / the II button | Menu (A resume, B quit) | II button |
| Restart / quit after death | `R` / `Esc` | A / B | Tap RESTART / MENU |
| Sound | `M` | View | SOUND ON/OFF |

Any controller using the browser's standard gamepad mapping works. Browsers only report a controller after
one of its buttons has been pressed. The game also pauses automatically when you leave the tab.

## Rules

- Enemies arrive from a random corner every ~1.7s (never the corner you are in). Each wave adds one
  enemy, up to 9; after that, waves come faster.
- New enemies flash and are harmless for 1 second. New gates blink and their mines are safe for 2 seconds.
- Hitboxes match the art: you die the moment any part of the ship touches an enemy or any part of a mine,
  spikes included.
- Touching a gate's bar with the ship's ring destroys every enemy within 200 units: +50 each, +20 for the gate.
- Each gem you pick up adds +1 to the multiplier. Gems fly toward you within 150 units and fade after 7 seconds.
- Score = points × multiplier × difficulty level (3–8), so harder settings score more.
- High score, difficulty, background and mute are saved in localStorage.

## Online leaderboard

After a run you can submit your score with a name, and the menu's LEADERBOARD shows the top 20 for each
difficulty. The backend is PHP + MySQL in `server/`. See [server/README.md](server/README.md) for
setting it up in cPanel and for how submissions are checked. Without the backend, the game works as before
and the leaderboard shows as offline.

## Project layout

```
src/
  main.ts          Phaser game config, high-DPI canvas, resize handling
  config.ts        All tuning values (speeds, timings, sizes, colours)
  settings.ts      Persistent settings (localStorage, failure-safe)
  view.ts          Camera fit: playfield is at least 820 units on its short side
  textures.ts      Neon sprites generated in code with canvas glow
  entities.ts      Player, Enemy, Gem, Gate, and an object Pool
  steering.ts      Mouse-follow and relative touch-drag input
  audio.ts         Synthesised sound effects and the generative soundtrack (Web Audio API)
  gamepad.ts       Controller button mapping
  backdrop.ts      Cover-fit parallax background
  ui.ts            Text/button helpers
  scenes/          Boot (loading), Menu, Game
public/assets/     Backgrounds from the original project
```

## Fixes and changes from the original

- Movement uses elapsed time instead of frame counts, so the game plays at the same speed on 60Hz and 144Hz screens.
- Enemies, gems and gates are pooled with no fixed limit (the original crashed when its 500-enemy cache ran out).
- Gates stay until cleared, as in the original, so they drift into overlapping minefields; at most 7 are on
  screen at once. They never spawn on top of the player, and now spin.
  Hit tests are done in the gate's rotated frame, with a swept check so a fast pass can't skip the bar.
- Difficulty labels match the slider values, the multiplier resets correctly, and resizing or rotating the device re-lays out the game.
- Mobile gets every difficulty, relative drag steering, a scaled playfield and a pause button.
- Added: particles, shockwave rings, screen shake, score pop-ups, slow-motion death, pause.

## Sound

There are no audio files: everything is synthesised live with the Web Audio API in `src/audio.ts`.

- **Soundtrack:** a looping synthwave piece in A minor (Am7, Fmaj7, Dm7, E7 at 112 BPM). It uses detuned saw
  pads with reverb, a filtered bass, a square-wave arpeggio with a dotted-eighth echo, and drums. The menu plays
  a soft, filtered version. In a run, layers build up the longer you survive: hats and snare after 15s,
  four-on-the-floor kick after 45s, 16th-note hats after 90s. Pausing muffles it, and dying strips it back to the pads.
- **Effects:** start sweep, gate zap and blast (bigger the more enemies it destroys), gem blips that climb a
  pentatonic scale during a chain, ship explosion, game-over and high-score jingles, and menu ticks.

Audio starts after your first click, tap or key press (a browser rule), and pauses when the tab is hidden.
