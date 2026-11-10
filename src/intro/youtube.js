/**
 * YouTube IFrame Player helpers. The intro footage and music are *embedded* through YouTube's
 * official player (allowed by YouTube's terms), never downloaded or re-hosted.
 */
let apiPromise = null;

/** Load the IFrame API, retrying once (fresh script tag) on a network failure or timeout. */
export function loadYouTubeAPI(timeoutMs = 7000, retries = 1) {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  const attempt = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('YouTube API timed out')), timeoutMs);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { clearTimeout(timer); reject(new Error('YouTube API blocked or offline')); };
    document.head.appendChild(s);
  });
  apiPromise = attempt().catch((e) => {
    if (retries <= 0) throw e;
    console.warn('YouTube API load failed, retrying once:', e.message);
    document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]').forEach((n) => n.remove());
    return attempt();
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

/**
 * Seamless montage with two players (A/B): while one plays, the other pre-buffers the next
 * segment hidden (opacity 0), then they cross-fade. The viewer never sees a player that is
 * seeking or paused, so YouTube's pause/spinner icons never appear between cuts.
 *   els: the two wrapper elements (class 'show' = visible)
 */
export function playSegmentsAB(players, els, segments, { onTime, onStall, xfade = 0.5, prepareAhead = 6 } = {}) {
  return new Promise((resolve) => {
    let cur = 0, i = 0, prepared = -1, cutting = false, lastT = -1, stallT = 0, done = false, guard = 0.6;
    const single = players[0] === players[1]; // only one player could be created
    const other = () => (single ? cur : 1 - cur);
    const prepare = (p, seg) => {
      // play muted & hidden until it is really rolling at the cut-in point, then park it paused there
      try {
        p.mute(); p.seekTo(seg[0], true); p.playVideo();
        const iv = setInterval(() => {
          if (p.getPlayerState?.() === 1) { clearInterval(iv); p.pauseVideo(); p.seekTo(seg[0], true); }
        }, 120);
        setTimeout(() => clearInterval(iv), 8000);
      } catch (e) { console.warn('Could not pre-buffer next intro segment:', e?.message || e); }
    };
    els[0].classList.add('show'); els[1].classList.remove('show');
    players[0].seekTo(segments[0][0], true); players[0].playVideo();
    const iv = setInterval(() => {
      if (done) return;
      const p = players[cur];
      const t = p.getCurrentTime?.() ?? 0;
      if (guard > 0) { guard -= 0.1; lastT = t; return; }
      const [, b] = segments[i];
      if (Math.abs(t - lastT) < 0.01 && !cutting) { stallT += 0.1; if (stallT > 1.2) onStall?.(true); } else { if (stallT > 1.2) onStall?.(false); stallT = 0; }
      lastT = t;
      onTime?.(t, i, b - t);
      const hasNext = i + 1 < segments.length;
      if (!single && hasNext && prepared !== i + 1 && b - t <= prepareAhead) { prepared = i + 1; prepare(players[other()], segments[i + 1]); }
      if (!cutting && b - t <= (hasNext ? xfade : 0.08)) {
        if (!hasNext) { done = true; clearInterval(iv); resolve(); return; }
        cutting = true;
        if (single) { try { p.seekTo(segments[i + 1][0], true); } catch (e) { console.warn('Intro cut failed:', e?.message || e); } i++; guard = 0.4; setTimeout(() => { cutting = false; }, 200); return; }
        const n = players[other()], old = p, oldEl = els[cur], newEl = els[other()];
        try { n.seekTo(segments[i + 1][0], true); n.playVideo(); } catch (e) { console.warn('Intro cut failed:', e?.message || e); }
        newEl.classList.add('show'); oldEl.classList.remove('show');     // CSS cross-fade
        setTimeout(() => { try { old.pauseVideo(); } catch (e) { console.info('Pause after cut:', e?.message || e); } }, xfade * 1000 + 150);
        cur = other(); i++; guard = 0.4;
        setTimeout(() => { cutting = false; }, xfade * 1000);
      }
    }, 100);
  });
}
