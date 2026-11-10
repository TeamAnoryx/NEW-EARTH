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
