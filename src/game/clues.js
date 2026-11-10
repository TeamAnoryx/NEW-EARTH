/**
 * CLUE button content. A clue is chosen from the objective the player is on right now, so the
 * same button always answers "what do I do next?" — once a step is done the objective moves on
 * and the next press gives the next clue.
 *
 * Each entry: [pattern matched against the current objective text, clue title, clue body].
 * Order matters: the first match wins.
 */
const USE = 'press E (USE on touch)';

const CLUES = [
  // ---- Level 0 · Prologue
  [/^Wake Sean and Anna|^Wake the other one/i, 'WAKE THE CREW',
    `Sean and Anna are asleep in the bunk pods at the back of the room. Walk up to each pod until the prompt appears, then ${USE}.`],
  [/^Check the door/i, 'CHECK THE DOOR',
    'Walk towards the glass door at the front of the quarters. Get close — the scene starts on its own.'],
  [/^Search the quarters/i, 'SEARCH THE QUARTERS',
    `The lockers and the desk hold nothing useful. Look under the bench in the corner beyond the desk, near the door — ${USE} on "Search under the bench".`],
  [/^Study the station map/i, 'READ THE MAP',
    'The nav-pad is open. Find Storage C-7 below you, then tap PROCEED TO LEVEL 1.'],
  [/^Open the MAP/i, 'OPEN THE MAP',
    'Tap MAP (or press Tab), then tap PROCEED TO LEVEL 1. Hurry — the glass is cracking.'],

  // ---- Level 1 · Salvage
  [/^Enter the air duct/i, 'INTO THE VENT',
    `Walk to the open vent where the grate was pried off and ${USE} on "Climb into the vent".`],
  [/^Crawl through the duct/i, 'THE DUCT',
    `Crawl along the duct past the grate. At the far end, ${USE} on "Drop into Storage C-7". Keep it slow — sound carries.`],
  [/^Ask Sean to close the door/i, 'SECURE THE DOOR',
    'Tap the SWITCH button that appears, pick Sean or Anna, and play as them. Max is too far from the door.'],
  [/^Close and lock the door as/i, 'CLOSE IT SILENTLY',
    'Turn on CRAWL (X / CRAWL) so your steps make zero noise and creep to the door panel. HOLD E / USE to slide it shut slowly — watch the noise meter on the left.'],
  [/^Engage the mag-lock/i, 'LOCK IT',
    `Stay at the door panel and ${USE} on "Engage mag-lock".`],
  [/^Regroup with the crew/i, 'MAKE A PLAN',
    `Walk to the crates in the middle of the room and ${USE} on "Sit down and plan".`],

  // ---- Level 2 · Blackout
  [/^Cut the deck power/i, 'KILL THE POWER',
    `The main breaker is on the storage-room wall opposite the door. ${USE} on "Pull the main breaker".`],
  [/^Unlock the storage door/i, 'OPEN THE DOOR',
    `Go to the storage door panel and ${USE} on "Release the mag-lock". Turn the LIGHT off when infected are near — they sense it in the dark.`],
  [/^Sneak through the Logistics Spine/i, 'THE SPINE',
    'Head out along the long corridor. CROUCH or CRAWL, walk — don\'t sprint — and steer around the infected. If one turns towards you, stop and go dark.'],
  [/^Find an aux power fuse/i, 'THE FUSE',
    `Keep to the right side of the spine — the fuse locker sits in a small lit alcove. ${USE} on "Search the fuse locker". Rummaging is noisy: check nothing is close first.`],
  [/^Reach the control room/i, 'THE CONTROL ROOM',
    'Continue to the far end of the spine. The control room is at the very end — walk in and the door seals behind you.'],
  [/^Install the fuse/i, 'RESTORE AUX POWER',
    `Find the aux cabinet inside the control room and ${USE} on "Install the aux fuse".`],
  [/^Align the comms antenna/i, 'ALIGN THE DISH',
    `Go to the COMMS console and ${USE}. Tap LOCK (or E) exactly when the needle is inside the green band — 3 hits. Misses are loud.`],
  [/^Send a signal to Earth/i, 'CALL EARTH',
    `Stay at the COMMS console and ${USE} on "Transmit distress call".`],

  // ---- Level 3 · New Earth
  [/^Retrieve the Genesis core/i, 'THE GENESIS CORE',
    `Find the vault with the glowing core in the control room and ${USE} on "Open the Genesis vault". The control door is giving way — move fast.`],
  [/^Override the pod bay door/i, 'THE BAY DOOR',
    'Go to the pod bay door panel and HOLD E / USE until the override bar fills. Letting go pauses it.'],
  [/^RUN/i, 'RUN',
    'SPRINT straight to escape pod EP-3 through the open bay door. Don\'t stop — they are hunting you now.'],
];

/** Fallback clues per task id, used when the objective text has no specific entry. */
const TASK_CLUES = {
  weapons: `Something to fight with: search the workbench — ${USE} on "Search the workbench".`,
  food: `Food and water: search the supply racks along the wall — ${USE} on "Search the supply racks".`,
  protection: `Protection: the EVA locker on the wall opposite the door — ${USE} on "Open the EVA locker".`,
  medical: `Medical supplies: the med cabinet in the corner by the door side — ${USE} on "Open the med cabinet".`,
};

/**
 * @param {{objective: string|null, tasks: Array<{id:string,text:string,done:boolean}>|null, cinematic: boolean, level: number}} state
 * @returns {{title: string, text: string, step: string|null}}
 */
export function clueFor(state) {
  const { objective, tasks, cinematic } = state;
  const open = tasks?.filter((t) => !t.done) || [];
  const step = tasks?.length ? `TASK ${Math.min(tasks.length, tasks.length - open.length + 1)} / ${tasks.length}` : null;
  if (cinematic || !objective) {
    return { title: 'SCENE IN PROGRESS', text: 'Watch the scene, or tap SKIP (top right) to jump straight to the next playable task. Ask again once you are in control.', step };
  }
  // Level 1 search: any order — point at the first supply still missing
  if (/^Search the storage room/i.test(objective)) {
    const t = open.find((x) => TASK_CLUES[x.id]);
    if (t) return { title: t.text.toUpperCase(), text: TASK_CLUES[t.id], step };
  }
  for (const [re, title, text] of CLUES) if (re.test(objective)) return { title, text, step };
  const next = open[0];
  if (next) return { title: next.text.toUpperCase(), text: TASK_CLUES[next.id] || `Current goal: ${objective}. Look for a glowing prompt and ${USE}.`, step };
  return { title: 'CURRENT GOAL', text: `${objective}. Look around for a glowing prompt and ${USE}.`, step };
}
