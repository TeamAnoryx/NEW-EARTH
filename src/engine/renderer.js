import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const QUALITY = {
  low:    { pixelRatio: 1.0,  shadows: false, shadowSize: 512,  bloom: false, smaa: false },
  medium: { pixelRatio: 1.35,  shadows: true,  shadowSize: 1024, bloom: true,  smaa: false },
  high:   { pixelRatio: 1.5,  shadows: true,  shadowSize: 2048, bloom: true,  smaa: true },
  ultra:  { pixelRatio: 2.0,  shadows: true,  shadowSize: 2048, bloom: true,  smaa: true },
};

/** Cinematic grade: chromatic aberration, vignette, film grain, danger pulse, fade, lens dirt glow. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0.0018 },
    uVignette: { value: 1.05 },
    uGrain: { value: 0.055 },
    uDanger: { value: 0 },
    uFade: { value: 0 },
    uDesat: { value: 0 },
    uTint: { value: new THREE.Color(1.0, 1.0, 1.0) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberration, uVignette, uGrain, uDanger, uFade, uDesat;
    uniform vec3 uTint;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      float ab = uAberration * (1.0 + 4.0 * r2) * (1.0 + uDanger * 2.5);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ab * 2.0).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ab * 2.0).b;
      // subtle teal/orange split-tone
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * vec3(0.92, 1.0, 1.08), smoothstep(0.5, 0.0, l) * 0.35);
      col = mix(col, vec3(l), uDesat);
      col *= uTint;
      // vignette
      float vig = smoothstep(0.85 * uVignette, 0.18, length(c * vec2(1.0, 0.85)));
      col *= mix(0.35, 1.0, vig);
      // danger pulse
      float pulse = 0.6 + 0.4 * sin(uTime * 6.0);
      col = mix(col, col * vec3(1.25, 0.45, 0.45) + vec3(0.12, 0.0, 0.0) * (1.0 - vig), uDanger * pulse * 0.8);
      // grain
      float g = hash(vUv * vec2(1931.0, 1777.0) + fract(uTime * 13.37)) - 0.5;
      col += g * uGrain * (1.0 - l * 0.6);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.03, 4000);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.1;
    pmrem.dispose();

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 0.92);
    this.grade = new ShaderPass(GradeShader);
    this.output = new OutputPass();
    this.smaa = new SMAAPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.smaa);

    this.setQuality('high');
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setDynamicPixelRatio(pr) {
    this.dynamicPR = pr;
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.resize();
  }

  setQuality(name) {
    const q = { ...(QUALITY[name] || QUALITY.high) };
    this.dynamicPR = undefined;
    this.quality = q;
    this.qualityName = name;
    // phones/tablets have tiny pixels: a 1.15× ceiling looks the same and costs ~40% fewer pixels
    if (matchMedia('(pointer: coarse)').matches) q.pixelRatio = Math.min(q.pixelRatio, 1.15);
    const dpr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.composer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = q.shadows;
    this.bloom.enabled = q.bloom;
    this.smaa.enabled = q.smaa;
    this.scene.traverse((o) => {
      if (o.isLight && o.shadow && o.castShadow) {
        o.shadow.mapSize.set(q.shadowSize, q.shadowSize);
        if (o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
      }
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => (m.needsUpdate = true));
      }
    });
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(time) {
    this.grade.uniforms.uTime.value = time;
    this.composer.render();
  }

  get fx() { return this.grade.uniforms; }
}
