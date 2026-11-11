import { isTouch } from '../ui/touch.js';

/**
 * Device-aware quality: picks a starting tier from the GPU/device, then a frame-time governor
 * scales the render resolution (and bloom) every ~1.5 s so the game holds its frame rate on
 * anything from a budget phone to a desktop GPU.
 */
export function detectTier(glRenderer) {
  const nav = navigator;
  const mem = nav.deviceMemory || 4, cores = nav.hardwareConcurrency || 4;
  const mobile = isTouch();
  let gpu = '';
  try {
    const gl = glRenderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch { /* privacy-restricted browsers */ }
  const g = String(gpu);
  if (/SwiftShader|llvmpipe|Software|Mali-[2-4]\d\d|Mali-T|Adreno \(TM\) [2-5]\d\d|PowerVR SGX|PowerVR Rogue GE/i.test(g) || mem <= 2) return { tier: 'low', gpu: g };
  if (mobile) {
    if (/Apple GPU|Adreno \(TM\) (7[3-9]\d|8\d\d)|Mali-G7[1-9]|Mali-G[7-9]\d\d|Immortalis|Xclipse/i.test(g) && mem >= 4) return { tier: 'medium', gpu: g };
    return { tier: cores <= 4 || mem <= 3 ? 'low' : 'medium', gpu: g };
  }
  if (/RTX|Radeon RX|Radeon Pro|Apple M[1-9]|Arc A|GeForce GTX 1[06-9]/i.test(g) && mem >= 8) return { tier: 'ultra', gpu: g };
  if (/Intel.*(UHD|HD) Graphics [2-6]\d\d|Intel HD/i.test(g)) return { tier: 'medium', gpu: g };
  return { tier: 'high', gpu: g };
}

export class FrameGovernor {
  constructor(renderer) {
    this.r = renderer;           // our Renderer wrapper
    this.acc = 0; this.n = 0; this.window = 0;
    this.enabled = true;
    this.bloomCut = false;
  }

  reset() { this.acc = 0; this.n = 0; this.window = 0; }

  /** Call once per rendered frame with the real (unclamped) frame time in seconds. */
  sample(dt) {
    if (!this.enabled || dt <= 0 || dt > 0.5) return;
    this.acc += dt; this.n++; this.window += dt;
    if (this.window < 1.5) return;
    const avg = this.acc / this.n;
    this.reset();
    const r = this.r, q = r.quality;
    const maxPR = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    const minPR = Math.min(maxPR, 0.55);
    let pr = r.dynamicPR ?? maxPR;
    if (avg > 1 / 40) pr = Math.max(minPR, pr * (avg > 1 / 25 ? 0.78 : 0.88));       // under ~40 fps: drop resolution
    else if (avg < 1 / 57 && pr < maxPR) pr = Math.min(maxPR, pr * 1.08);             // comfortably at 60: claw it back
    if (Math.abs(pr - (r.dynamicPR ?? maxPR)) > 0.01) r.setDynamicPixelRatio(pr);
    // still slow at minimum resolution → drop bloom; restore when there is headroom again
    if (pr <= minPR + 0.01 && avg > 1 / 32 && r.bloom.enabled) { r.bloom.enabled = false; this.bloomCut = true; }
    else if (this.bloomCut && avg < 1 / 55 && pr >= maxPR * 0.95) { r.bloom.enabled = q.bloom; this.bloomCut = false; }
  }
}
