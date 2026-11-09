/**
 * YouTube IFrame Player helpers. The intro footage and music are *embedded* through YouTube's
 * official player (allowed by YouTube's terms), never downloaded or re-hosted.
 */
let apiPromise = null;

export function loadYouTubeAPI(timeoutMs = 7000) {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('YouTube API timed out')), timeoutMs);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { clearTimeout(timer); reject(new Error('YouTube API blocked or offline')); };
    document.head.appendChild(s);
  });
  apiPromise.catch(() => { apiPromise = null; });
  return apiPromise;
}

/** Create a player in `el` and resolve once it is ready. */
export function createPlayer(YT, el, videoId, { muted = false, start = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('player ready timeout')), 9000);
    // eslint-disable-next-line no-new
    new YT.Player(el, {
      videoId,
      playerVars: {
        autoplay: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1,
        playsinline: 1, rel: 0, start, mute: muted ? 1 : 0, origin: location.origin,
      },
      events: {
        onReady: (e) => { clearTimeout(timer); if (muted) e.target.mute(); resolve(e.target); },
        // errors can also arrive after ready (embedding refused, removed, region-blocked): remember them
        onError: (e) => { clearTimeout(timer); e.target.__failed = e.data || 'error'; reject(new Error(`YouTube error ${e.data}`)); },
      },
    });
  });
}

/**
 * Plays a list of [start, end] segments back to back on one player by seeking.
 * Calls onCut(i) at each cut (for a masking flash), onTime(t, segIndex, segRemain) every tick,
 * and resolves when the last segment ends. Driven by the video clock, so buffering never desyncs.
 */
export function playSegments(player, segments, { onCut, onTime, onStall } = {}) {
  return new Promise((resolve) => {
    let i = 0, stallT = 0, lastT = -1, done = false, guard = 0.6;
    player.seekTo(segments[0][0], true);
    player.playVideo();
    const iv = setInterval(() => {
      if (done) return;
      const t = player.getCurrentTime?.() ?? 0;
      if (guard > 0) { guard -= 0.1; lastT = t; return; } // getCurrentTime lags right after a seek
      const [a, b] = segments[i];
      // stall detection (network): report so the caller can show a loader
      if (Math.abs(t - lastT) < 0.01) { stallT += 0.1; if (stallT > 1.2) onStall?.(true); } else { if (stallT > 1.2) onStall?.(false); stallT = 0; }
      lastT = t;
      onTime?.(t, i, b - t);
      void a;
      if (t >= b - 0.08) {
        i++;
        if (i >= segments.length) { done = true; clearInterval(iv); resolve(); return; }
        onCut?.(i);
        player.seekTo(segments[i][0], true);
        guard = 0.5;
      }
    }, 100);
  });
}

/** Resolve true once the player is genuinely playing (state 1, clock moving), false on error/timeout. */
export function waitUntilPlaying(player, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const start = performance.now();
    let t0 = null;
    const iv = setInterval(() => {
      if (player.__failed) { clearInterval(iv); resolve(false); return; }
      const st = player.getPlayerState?.(), t = player.getCurrentTime?.() ?? 0;
      if (st === 1) { if (t0 === null) t0 = t; else if (t > t0 + 0.05) { clearInterval(iv); resolve(true); return; } }
      if (performance.now() - start > timeoutMs) { clearInterval(iv); resolve(false); }
    }, 120);
  });
}
