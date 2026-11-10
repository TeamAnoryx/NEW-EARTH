/**
 * Level progress, persisted per browser.
 *   cleared  = highest level finished (-1 = none). Levels: 0 Prologue, 1 Salvage, 2 Blackout, 3 New Earth.
 *   unlocked = the furthest level the player may start from (cleared + 1, max 3).
 */
const KEY = 'new-earth-cleared';
const LEGACY = 'new-earth-level'; // older builds stored "level reached" (1–3)
export const LEVELS = [
  { n: 0, name: 'OUTBREAK', beat: 'intro' },
  { n: 1, name: 'SALVAGE', beat: 'l1intro' },
  { n: 2, name: 'BLACKOUT', beat: 'l2intro' },
  { n: 3, name: 'NEW EARTH', beat: 'l3' },
];

export function loadCleared() {
  try {
    const v = localStorage.getItem(KEY);
    if (v !== null) return Math.max(-1, Math.min(3, Math.floor(+v)));
    const legacy = +localStorage.getItem(LEGACY);
    return legacy >= 1 ? Math.min(3, legacy - 1) : -1;
  } catch (e) { console.info('Progress unavailable:', e?.message || e); return -1; }
}

export function saveCleared(level) {
  try { if (level > loadCleared()) localStorage.setItem(KEY, String(level)); }
  catch (e) { console.info('Progress not saved (storage unavailable):', e?.message || e); }
}

/** Furthest level the player may start (0–3). */
export function loadProgress() { return Math.min(3, loadCleared() + 1); }

/** Back-compat: "level n reached" == level n-1 cleared. */
export function saveProgress(level) { saveCleared(level - 1); }

// ---------------------------------------------------------------- exact resume point
const RESUME = 'new-earth-resume';
/** Which level each story beat belongs to. */
export const BEAT_LEVEL = { intro: 0, wake: 0, door: 0, search: 0, duct: 0, l1intro: 1, storage: 1, ending: 1, l2intro: 2, l2ctrl: 2, l3: 3 };

/** Story order of checkpoint beats; the saved resume point only ever moves forward along it. */
export const BEAT_ORDER = ['intro', 'door', 'search', 'l1intro', 'storage', 'l2intro', 'l2ctrl', 'l3'];

/**
 * Remember the furthest checkpoint reached (persists across visits, per browser).
 * Replaying earlier parts (Restart / previous level) never moves it back: it only updates
 * once the new run gets past the old checkpoint.
 */
export function saveResume(beat) {
  const i = BEAT_ORDER.indexOf(beat);
  if (i < 0) return;
  try {
    const cur = BEAT_ORDER.indexOf(localStorage.getItem(RESUME));
    if (i > cur) localStorage.setItem(RESUME, beat);
  } catch (e) { console.info('Resume point not saved:', e?.message || e); }
}

/** Beat to continue from: the furthest checkpoint reached, or the start of the furthest unlocked level. */
export function loadResume() {
  const lvl = loadProgress();
  try {
    const b = localStorage.getItem(RESUME);
    if (b && b in BEAT_LEVEL && BEAT_LEVEL[b] >= lvl) return b; // only ever saved by actually reaching it
  } catch (e) { console.info('Resume point unavailable:', e?.message || e); }
  return LEVELS[lvl].beat;
}

