import * as THREE from 'three';
import { createEarth, createStars, createSun, createStationExterior } from '../world/space.js';

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/**
 * Transparent WebGL layer for the intro.
 *  - overlay phase: only the ring station, composited over the YouTube footage
 *  - space phase:  sunlit Earth limb + stars fade in underneath it (footage fades out)
 * Its own small renderer (alpha), disposed when the intro ends.
 */
export class IntroScene {
  constructor(canvas, { lowPower = false } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !lowPower, powerPreference: 'high-performance', premultipliedAlpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPower ? 1 : 1.75));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 8000);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);

    // sun from above/behind so the Earth gets a bright crown of light along its top limb
    const sunDir = new THREE.Vector3(0.15, 0.75, -0.65).normalize();
    this.earth = createEarth(1500, 1.0, { fadeable: true });
    this.earth.userData.uniforms.uSun.value.copy(sunDir);
    this.earth.position.set(0, -1640, -1250);
    this.earth.rotation.set(0.5, 2.2, 0.15);
    this.scene.add(this.earth);
    this.stars = createStars(4000, 3000); this.scene.add(this.stars);
    this.sun = createSun(sunDir, 3200); this.sun.scale.setScalar(700); this.scene.add(this.sun);
    this.setSpace(0);

    this.station = createStationExterior();
    this.station.visible = false;
    this.scene.add(this.station);
    const key = new THREE.DirectionalLight(0xfff1dc, 2.6); key.position.copy(sunDir).multiplyScalar(100); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x5c8fd6, 0.9); fill.position.set(-1, -0.6, 0.4); this.scene.add(fill);
    this.scene.add(new THREE.AmbientLight(0x6a86b0, 0.45));

    this.slide = null;
    this.t = 0;
    this._raf = 0;
    this._last = performance.now();
    this.resize();
    this._onResize = () => this.resize();
    addEventListener('resize', this._onResize);
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the composition in landscape even when the device is still portrait for a moment
    this.camera.fov = w / h < 1 ? 60 : 38;
    this.camera.updateProjectionMatrix();
  }

  setSpace(v) {
    this.earth.userData.uniforms.uFade.value = v;
    this.stars.userData.uniforms.uFade.value = v;
    this.sun.material.opacity = v;
    this.earth.visible = this.stars.visible = this.sun.visible = v > 0.001;
  }

  fadeSpace(dur = 1.2) {
    const start = this.t;
    this._spaceFade = (t) => { const k = Math.min(1, (t - start) / dur); this.setSpace(easeInOut(k)); if (k >= 1) this._spaceFade = null; };
  }

  /**
   * Station slides out from behind the Earth's limb: starts as a tiny point near the horizon,
   * grows while sweeping left, tilted, and settles so ~90% of it is in frame, then keeps drifting.
   */
  slideIn(dur = 3) {
    const st = this.station;
    st.visible = true;
    const mobilePortrait = innerWidth < innerHeight;
    this.slide = {
      t0: this.t, dur,
      from: new THREE.Vector3(60, -40, -2600),
      to: mobilePortrait ? new THREE.Vector3(-16, -6, -190) : new THREE.Vector3(-46, -6, -175),
      rFrom: new THREE.Euler(0.05, -1.4, 0.0),
      rTo: new THREE.Euler(0.62, 0.55, -0.38),
    };
  }

  _loop(now) {
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, (now - this._last) / 1000); this._last = now;
    this.t += dt;
    const t = this.t;
    this.earth.userData.update(t * 0.5, this.camera);
    this.stars.userData.update(t);
    this.station.userData.update(t);
    this._spaceFade?.(t);
    const s = this.slide;
    if (s) {
      const k = Math.min(1, (t - s.t0) / s.dur), e = easeOutCubic(k);
      this.station.position.lerpVectors(s.from, s.to, e);
      this.station.rotation.set(
        THREE.MathUtils.lerp(s.rFrom.x, s.rTo.x, e),
        THREE.MathUtils.lerp(s.rFrom.y, s.rTo.y, e) + (1 - e) * 1.6,
        THREE.MathUtils.lerp(s.rFrom.z, s.rTo.z, e),
      );
      if (k >= 1) {
        // a living ship: slow drift + gentle banking after it arrives
        const d = t - s.t0 - s.dur;
        this.station.position.x = s.to.x + Math.sin(d * 0.25) * 1.2 - d * 0.35;
        this.station.position.y = s.to.y + Math.sin(d * 0.4) * 0.6;
        this.station.rotation.z = s.rTo.z + Math.sin(d * 0.3) * 0.03;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    removeEventListener('resize', this._onResize);
    this.scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => x.dispose?.()); });
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}
