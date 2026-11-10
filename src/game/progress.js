const KEY = 'new-earth-level';
/** Highest level reached (1–3), persisted per browser. */
export function loadProgress() {
  try { return Math.min(3, Math.max(1, +localStorage.getItem(KEY) || 1)); } catch (e) { console.info('Progress unavailable:', e?.message || e); return 1; }
}
export function saveProgress(level) {
  try { if (level > loadProgress()) localStorage.setItem(KEY, String(level)); } catch (e) { console.info('Progress not saved (storage unavailable):', e?.message || e); }
}
