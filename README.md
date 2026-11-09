# NEW EARTH

Single-player space-survival game in the browser. **Prologue — Outbreak** is playable end to end.

The infected are blind. They hunt by sound.

## Play

```bash
npm install
npm run dev              # http://localhost:5173
npm run build:offline    # dist-offline/index.html: one file, double-click to play, no internet needed
npm run build            # dist/: static site for any web host
```

**Built for phones (landscape).** Left thumb moves (floating stick), right thumb drags to look and taps to skip dialogue. Buttons: **E** interact (tap or hold), crouch toggle, sprint (hold), map, pause. It goes fullscreen and locks to landscape where the browser allows; iOS Safari can't do either, so it shows a rotate prompt.

Keyboard still works for testing: **WASD** move · **Mouse** look (click to capture) · **Shift** sprint (loud) · **C/Ctrl** crouch (silent) · **E** interact · **Space** advance dialogue · **Tab** station map · **Esc** pause.

## What's in it
- Three.js r186 renderer: ACES, PBR, shadows, bloom, SMAA, and a cinematic grade (chromatic aberration, vignette, grain, danger pulse).
- Procedural world: ring-station exterior over a shader Earth (clouds, ocean glint, city lights); crew quarters, infected corridor, crawl duct, Storage C-7 and the logistics hallway.
- Procedural rigged characters with blended animation: idle, walk, run, crouch, crawl, sleep, sit, kneel, reach. The infected have their own shamble, run, scream, pound, feed and twitch.
- Story director: cutscenes, typed subtitles, a QTE, a glass-integrity timer, a sound-based stealth AI, companions that follow your trail, checkpoints and retry.
- Fully synthesised WebAudio, with no audio files.
- Quality presets (low → ultra), mouse sensitivity, volume and invert-Y, saved locally.

Earth textures: three.js r186 `examples/textures/planets` (day, night, bump/roughness/clouds), resized to 2048 px for mobile GPUs. See `CREDITS.md`.

Design docs: `design/game-brief.md`, `design/art-bible.md`.
