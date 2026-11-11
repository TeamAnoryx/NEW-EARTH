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

## Intro sequence
Tap to enter → full screen + landscape lock → 3-2-1 countdown → footage montage (0:00–0:45, 3:46–3:54, 4:10–4:25, 6:44–6:55) with the intro score → the station rises from behind Earth in the last 3 s → **NEW EARTH** builds letter by letter → *Created by ANORYX* / *A creative effort from Anoryx* → exit-full-screen button → 2 s white-out → **Powered by ANORYX** (3 s) → white fades in 1.3 s to the main console with its looping score.

- **Best quality: self-hosted cut.** Download the two files from the creators' official links, run `scripts/make-intro.sh <video> <music>` (needs ffmpeg), commit `public/intro/`, and push. The intro then plays your own 720p/480p cut and trimmed music: instant autoplay, no YouTube interface, synced captions. See `public/intro/README.md`.
- Without those files, footage and music are **embedded through YouTube's official player** (not downloaded or re-edited), so the intro needs an internet connection. If YouTube is unavailable, refused or slow, the intro switches to a built-in 3D cinematic with a synthesised score.
- Browsers only allow full screen, orientation lock and sound after a user gesture, so the first screen is a one-tap gate. iPhone Safari has no full-screen or orientation lock for web pages; it shows a rotate prompt instead.
- Replace the stand-in ANORYX emblem by editing `LOGO_MARK` in `src/intro/brand.js`. The credits are in the same file.
- Quality defaults to **Auto**: a GPU-tier guess plus a live frame-time governor that scales resolution and bloom.

## What's in it
- Three.js r186 renderer: ACES, PBR, shadows, bloom, SMAA, and a cinematic grade (chromatic aberration, vignette, grain, danger pulse).
- Procedural world: ring-station exterior over a shader Earth (clouds, ocean glint, city lights); crew quarters, infected corridor, crawl duct, Storage C-7 and the logistics hallway.
- Procedural rigged characters with blended animation: idle, walk, run, crouch, crawl, sleep, sit, kneel, reach. The infected have their own shamble, run, scream, pound, feed and twitch.
- Story director: cutscenes, typed subtitles, a QTE, a glass-integrity timer, a sound-based stealth AI, companions that follow your trail, checkpoints and retry.
- Fully synthesised WebAudio, with no audio files.
- Quality presets (low → ultra), mouse sensitivity, volume and invert-Y, saved locally.

Earth textures: three.js r186 `examples/textures/planets` (day, night, bump/roughness/clouds), resized to 2048 px for mobile GPUs. See `CREDITS.md`.

Design docs: `design/game-brief.md`, `design/art-bible.md`.
