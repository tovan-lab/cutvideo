import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { StepStatus, StudioStep } from '../../types/studio';

export interface SolarSystemHandle {
  resetView(): void;
}

interface SolarSystemSceneProps {
  steps: StudioStep[];
  onSelectStep?: (id: string) => void;
  className?: string;
}

// ─── Trạng thái → hiệu ứng ──────────────────────────────────────────────────

interface StatusFx {
  halo: string;
  haloOpacity: number;
  particle: string;
  particleOpacity: number;
  particleSpeed: number;
  tint: string;
}

const FX: Record<StepStatus, StatusFx> = {
  pending: { halo: '#93c5fd', haloOpacity: 0.16, particle: '#bfdbfe', particleOpacity: 0.35, particleSpeed: 0.35, tint: '#ffffff' },
  running: { halo: '#38bdf8', haloOpacity: 0.95, particle: '#67e8f9', particleOpacity: 1, particleSpeed: 2.4, tint: '#ffffff' },
  done: { halo: '#34d399', haloOpacity: 0.42, particle: '#6ee7b7', particleOpacity: 0.7, particleSpeed: 0.8, tint: '#ffffff' },
  skipped: { halo: '#64748b', haloOpacity: 0.06, particle: '#64748b', particleOpacity: 0.12, particleSpeed: 0.2, tint: '#5b6472' },
  error: { halo: '#f43f5e', haloOpacity: 0.85, particle: '#fda4af', particleOpacity: 0.95, particleSpeed: 1.3, tint: '#ffd4d4' },
};

const STATUS_TEXT: Record<StepStatus, string> = {
  pending: 'Chờ',
  running: 'Đang xử lý',
  done: 'Hoàn thành',
  skipped: 'Bỏ qua',
  error: 'Lỗi',
};

const BADGE_CLASS: Record<StepStatus, string> = {
  pending: 'bg-slate-900/80 border-slate-500/70 text-slate-200',
  running: 'bg-sky-500 border-sky-200 text-white shadow-[0_0_14px_4px_rgba(56,189,248,0.65)]',
  done: 'bg-emerald-500/90 border-emerald-200 text-white',
  skipped: 'bg-slate-800/80 border-slate-700 text-slate-500',
  error: 'bg-rose-500 border-rose-200 text-white',
};

// ─── Texture thủ tục (noise) ────────────────────────────────────────────────

type RGB = [number, number, number];

function seeded(seed: number) {
  let s = (seed * 2654435761) % 4294967296;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Value noise lặp theo chiều ngang để texture quấn quanh quả cầu không lộ đường nối. */
function valueNoise(seed: number, gw: number, gh: number) {
  const rand = seeded(seed);
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  return (u: number, v: number) => {
    const gx = (((u % 1) + 1) % 1) * gw;
    const gy = Math.max(0, Math.min(0.9999, v)) * (gh - 1);
    const x0 = Math.floor(gx) % gw;
    const y0 = Math.floor(gy);
    const x1 = (x0 + 1) % gw;
    const y1 = Math.min(y0 + 1, gh - 1);
    const fx = gx - Math.floor(gx);
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = grid[y0 * gw + x0];
    const b = grid[y0 * gw + x1];
    const c = grid[y1 * gw + x0];
    const d = grid[y1 * gw + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function fbm(seed: number, octaves: number) {
  const layers = Array.from({ length: octaves }, (_, i) => valueNoise(seed + i * 31, 4 << i, (2 << i) + 1));
  const norm = layers.reduce((s, _, i) => s + 0.5 ** i, 0);
  return (u: number, v: number) => layers.reduce((s, n, i) => s + n(u, v) * 0.5 ** i, 0) / norm;
}

function paint(w: number, h: number, fn: (u: number, v: number) => RGB | [number, number, number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = fn(x / w, y / h);
      const i = (y * w + x) * 4;
      img.data[i] = px[0];
      img.data[i + 1] = px[1];
      img.data[i + 2] = px[2];
      img.data[i + 3] = px.length === 4 ? px[3] : 255;
    }
  }
  g.putImageData(img, 0, 0);
  return { canvas: c, ctx: g };
}

function toTexture(canvas: HTMLCanvasElement): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function bandedGas(seed: number, palette: string[], bands: number, turbulence: number) {
  const cols = palette.map(hex);
  const n = fbm(seed, 5);
  return (u: number, v: number): RGB => {
    const t = v + (n(u * 3, v * 6) - 0.5) * turbulence;
    const f = t * bands;
    const i = Math.floor(f);
    const a = cols[((i % cols.length) + cols.length) % cols.length];
    const b = cols[(((i + 1) % cols.length) + cols.length) % cols.length];
    const shade = 0.88 + n(u * 8, v * 16) * 0.24;
    const c = mix(a, b, smooth(0.35, 0.65, f - i));
    return [c[0] * shade, c[1] * shade, c[2] * shade];
  };
}

interface PlanetSpec {
  name: string;
  radius: number;
  tilt: number;
  spin: number;
  texture: () => HTMLCanvasElement;
  clouds?: boolean;
  ring?: { inner: number; outer: number; color: string; opacity: number };
}

const W = 384;
const H = 192;

const SOLAR: PlanetSpec[] = [
  {
    name: 'Sao Thủy',
    radius: 0.55,
    tilt: 0.03,
    spin: 0.25,
    texture: () => {
      const n = fbm(11, 5);
      const { canvas, ctx } = paint(W, H, (u, v) => {
        const k = n(u, v);
        return mix(hex('#5d5a57'), hex('#b7b1a8'), k * 1.3 - 0.1);
      });
      const rand = seeded(12);
      for (let i = 0; i < 70; i++) {
        const x = rand() * W;
        const y = rand() * H;
        const r = 2 + rand() * 9;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(40,38,36,0.55)');
        grad.addColorStop(0.75, 'rgba(60,58,55,0.25)');
        grad.addColorStop(0.9, 'rgba(230,225,215,0.35)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      return canvas;
    },
  },
  {
    name: 'Sao Kim',
    radius: 0.82,
    tilt: 0.05,
    spin: -0.12,
    texture: () => {
      const n = fbm(21, 5);
      return paint(W, H, (u, v) => {
        const k = n(u * 1.5 + Math.sin(v * 9) * 0.08, v);
        return mix(hex('#a8783c'), hex('#f4dca6'), k * 1.2);
      }).canvas;
    },
  },
  {
    name: 'Trái Đất',
    radius: 0.86,
    tilt: 0.41,
    spin: 0.45,
    clouds: true,
    texture: () => {
      const n = fbm(31, 6);
      const d = fbm(37, 4);
      return paint(W, H, (u, v) => {
        const lat = Math.abs(v - 0.5) * 2;
        const k = n(u, v);
        if (lat > 0.86 + (k - 0.5) * 0.2) return [236, 242, 248];
        if (k < 0.53) return mix(hex('#07224f'), hex('#1f64b0'), k / 0.53);
        const dry = smooth(0.1, 0.45, 1 - Math.abs(lat - 0.35) * 3) * d(u * 2, v * 2);
        return mix(mix(hex('#2f6b2e'), hex('#6b8f3a'), (k - 0.53) * 5), hex('#b89b62'), dry * 1.4);
      }).canvas;
    },
  },
  {
    name: 'Sao Hỏa',
    radius: 0.66,
    tilt: 0.44,
    spin: 0.43,
    texture: () => {
      const n = fbm(41, 6);
      const m = fbm(47, 4);
      return paint(W, H, (u, v) => {
        const lat = Math.abs(v - 0.5) * 2;
        if (lat > 0.9) return [240, 232, 226];
        const base = mix(hex('#7a2e14'), hex('#d67a45'), n(u, v) * 1.25);
        return mix(base, hex('#4a1d10'), smooth(0.58, 0.75, m(u * 2, v * 2)) * 0.6);
      }).canvas;
    },
  },
  {
    name: 'Sao Mộc',
    radius: 1.65,
    tilt: 0.05,
    spin: 0.9,
    texture: () => {
      const gas = bandedGas(51, ['#d9b98f', '#a8704a', '#f1e3c8', '#c68a58', '#e7cfa6', '#8c5a3c'], 16, 0.07);
      return paint(W, H, (u, v) => {
        const c = gas(u, v);
        const dx = (u - 0.68) / 0.07;
        const dy = (v - 0.64) / 0.035;
        const spot = Math.exp(-(dx * dx + dy * dy));
        return mix(c, hex('#b4452a'), spot * 0.85);
      }).canvas;
    },
  },
  {
    name: 'Sao Thổ',
    radius: 1.4,
    tilt: 0.47,
    spin: 0.8,
    ring: { inner: 1.35, outer: 2.35, color: '#e6d3a3', opacity: 0.85 },
    texture: () => paint(W, H, bandedGas(61, ['#e9d5a6', '#cfb07a', '#f3e6c6', '#b8955c'], 11, 0.04)).canvas,
  },
  {
    name: 'Sao Thiên Vương',
    radius: 1.1,
    tilt: 1.7,
    spin: -0.6,
    ring: { inner: 1.6, outer: 1.9, color: '#b9eef2', opacity: 0.35 },
    texture: () => paint(W, H, bandedGas(71, ['#9fdbe2', '#b8e9ee', '#8fd0d9'], 7, 0.02)).canvas,
  },
  {
    name: 'Sao Hải Vương',
    radius: 1.06,
    tilt: 0.49,
    spin: 0.65,
    texture: () =>
      paint(W, H, (u, v) => {
        const c = bandedGas(81, ['#2a44a8', '#3d62d6', '#2238a0', '#5b7fe6'], 9, 0.06)(u, v);
        const dx = (u - 0.3) / 0.05;
        const dy = (v - 0.4) / 0.03;
        return mix(c, hex('#14215e'), Math.exp(-(dx * dx + dy * dy)) * 0.8);
      }).canvas,
  },
];

function cloudTexture(): HTMLCanvasElement {
  const n = fbm(91, 6);
  return paint(W, H, (u, v) => {
    const a = smooth(0.52, 0.72, n(u * 1.4, v));
    return [255, 255, 255, a * 230];
  }).canvas;
}

function sunTexture(): HTMLCanvasElement {
  const n = fbm(5, 6);
  return paint(512, 256, (u, v) => {
    const k = n(u * 3, v * 3);
    const c = mix(hex('#ff7a10'), hex('#fff1b8'), k * 1.2);
    // Làm mịn về màu trung bình gần hai cực để không lộ vệt noise dồn lại ở đỉnh cầu.
    return mix(c, hex('#ffb347'), smooth(0.7, 1, Math.abs(v - 0.5) * 2));
  }).canvas;
}

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(255,255,255,0.6)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ringTexture(color: string): THREE.Texture {
  const [r, g, b] = hex(color);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 4;
  const ctx = c.getContext('2d')!;
  const rand = seeded(7);
  for (let x = 0; x < 256; x++) {
    const t = x / 255;
    let a = 0.35 + rand() * 0.5;
    if (t > 0.55 && t < 0.62) a *= 0.08; // khe Cassini
    if (t < 0.04 || t > 0.97) a *= 0.2;
    ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
    ctx.fillRect(x, 0, 1, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function nebulaTexture(inner: string, outer: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.45, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Bố cục: mỗi tầng là một quỹ đạo; các bước song song chung một quỹ đạo ──

interface OrbitSlot {
  step: StudioStep;
  index: number;
  level: number;
  orbitRadius: number;
  phase: number;
  spec: PlanetSpec;
}

function layoutOrbits(steps: StudioStep[]): { slots: OrbitSlot[]; radii: number[] } {
  const levels: number[][] = [];
  steps.forEach((s, i) => {
    if (s.group && steps[i - 1]?.group === s.group) levels[levels.length - 1].push(i);
    else levels.push([i]);
  });
  const spacing = levels.length <= 3 ? 8.5 : levels.length <= 5 ? 6.5 : 5.2;
  const radii = levels.map((_, L) => 8 + L * spacing);
  const slots: OrbitSlot[] = [];
  levels.forEach((members, L) => {
    members.forEach((idx, j) => {
      slots[idx] = {
        step: steps[idx],
        index: idx,
        level: L,
        orbitRadius: radii[L],
        // Lệch pha giữa các quỹ đạo để các hành tinh không xếp thẳng hàng.
        phase: (j / members.length) * Math.PI * 2 + L * 2.1,
        spec: SOLAR[idx % SOLAR.length],
      };
    });
  });
  return { slots, radii };
}

const angularSpeed = (r: number) => 0.34 / Math.sqrt(r);

// ─── Component ──────────────────────────────────────────────────────────────

interface PlanetRuntime {
  slot: OrbitSlot;
  status: StepStatus;
  pivot: THREE.Group; // vị trí trên quỹ đạo
  body: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  clouds?: THREE.Mesh;
  halo: THREE.Sprite;
  swarm: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  scanner: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  pop: number;
  label: { badge: HTMLSpanElement; card: HTMLDivElement; status: HTMLSpanElement; detail: HTMLDivElement };
}

interface LinkRuntime {
  from: PlanetRuntime | null; // null = Mặt Trời
  to: PlanetRuntime;
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  flow: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  offset: number;
}

const LINK_POINTS = 40;
const FLOW_POINTS = 18;

export const SolarSystemScene = forwardRef<SolarSystemHandle, SolarSystemSceneProps>(
  ({ steps, onSelectStep, className = '' }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const planetsRef = useRef(new Map<string, PlanetRuntime>());
    const stepsRef = useRef(steps);
    const selectRef = useRef(onSelectStep);
    const resetRef = useRef<() => void>(() => {});
    const [failed, setFailed] = useState(false);
    stepsRef.current = steps;
    selectRef.current = onSelectStep;

    useImperativeHandle(ref, () => ({ resetView: () => resetRef.current() }), []);

    const layoutKey = steps.map((s) => `${s.id}:${s.group || ''}`).join('|');

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      } catch {
        setFailed(true);
        return;
      }
      setFailed(false);

      const isSmall = container.clientWidth < 700;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const motion = reduceMotion ? 0.2 : 1;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSmall ? 1.5 : 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.touchAction = 'none';
      container.appendChild(renderer.domElement);

      const labelRenderer = new CSS2DRenderer();
      Object.assign(labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
      container.appendChild(labelRenderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);

      const disposables: { dispose: () => void }[] = [];
      const track = <T extends { dispose: () => void }>(x: T): T => {
        disposables.push(x);
        return x;
      };
      const glowTex = track(glowTexture());

      const { slots, radii } = layoutOrbits(stepsRef.current);
      const maxR = radii[radii.length - 1] ?? 10;

      // Ánh sáng: Mặt Trời là nguồn sáng chính, có mặt ngày/đêm rõ ràng.
      scene.add(new THREE.AmbientLight(0x6b7cff, 0.16));
      const sunLight = new THREE.PointLight(0xfff1d6, 3.2, 0, 0);
      scene.add(sunLight);

      // ── Nền: 3 lớp sao + dải Ngân Hà + tinh vân ──
      const starLayers: THREE.Points[] = [];
      const addStars = (count: number, rMin: number, rMax: number, size: number, speed: number, band = false) => {
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);
        const c = new THREE.Color();
        for (let i = 0; i < count; i++) {
          const r = rMin + Math.random() * (rMax - rMin);
          let theta = Math.random() * Math.PI * 2;
          let phi = Math.acos(2 * Math.random() - 1);
          if (band) phi = Math.PI / 2 + (Math.random() - 0.5) * (Math.random() * 0.5);
          const v = new THREE.Vector3().setFromSphericalCoords(r, phi, theta);
          if (band) v.applyEuler(new THREE.Euler(0.9, 0.3, 0.4));
          pos.set([v.x, v.y, v.z], i * 3);
          c.setHSL(band ? 0.62 + Math.random() * 0.2 : 0.55 + Math.random() * 0.2, band ? 0.5 : 0.35, 0.72 + Math.random() * 0.28);
          col.set([c.r, c.g, c.b], i * 3);
        }
        const geo = track(new THREE.BufferGeometry());
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const pts = new THREE.Points(
          geo,
          track(
            new THREE.PointsMaterial({
              size,
              map: glowTex,
              vertexColors: true,
              transparent: true,
              opacity: band ? 0.55 : 0.95,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
              sizeAttenuation: true,
            })
          )
        );
        pts.userData.speed = speed;
        scene.add(pts);
        starLayers.push(pts);
      };
      const scale = isSmall ? 0.5 : 1;
      addStars(1600 * scale, 220, 320, 1.1, 0.004);
      addStars(1200 * scale, 320, 520, 1.8, 0.002);
      addStars(700 * scale, 520, 800, 2.8, 0.001);
      addStars(4200 * scale, 400, 700, 1.6, 0.0015, true);

      const nebulae: THREE.Sprite[] = [];
      (
        [
          ['rgba(99,102,241,0.55)', 'rgba(67,56,202,0.16)', -260, 80, -420, 420],
          ['rgba(236,72,153,0.4)', 'rgba(126,34,206,0.14)', 320, -60, -380, 380],
          ['rgba(34,211,238,0.3)', 'rgba(14,116,144,0.1)', 40, 180, -520, 520],
        ] as const
      ).forEach(([inner, outer, x, y, z, s]) => {
        const sp = new THREE.Sprite(
          track(
            new THREE.SpriteMaterial({
              map: track(nebulaTexture(inner, outer)),
              transparent: true,
              opacity: 0.6,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            })
          )
        );
        sp.position.set(x, y, z);
        sp.scale.set(s, s, 1);
        scene.add(sp);
        nebulae.push(sp);
      });

      // ── Mạng lưới mặt phẳng quỹ đạo + các vòng quỹ đạo ──
      const grid = new THREE.PolarGridHelper(maxR + 10, 24, Math.round((maxR + 10) / 3), 128, 0x3b4a8c, 0x1b2550);
      const gridMat = grid.material as THREE.Material;
      gridMat.transparent = true;
      gridMat.opacity = 0.32;
      gridMat.depthWrite = false;
      track(grid.geometry);
      track(gridMat);
      scene.add(grid);

      const orbitLines = radii.map((r) => {
        const pts = new THREE.EllipseCurve(0, 0, r, r).getPoints(256).map((p) => new THREE.Vector3(p.x, 0, p.y));
        const line = new THREE.LineLoop(
          track(new THREE.BufferGeometry().setFromPoints(pts)),
          track(new THREE.LineBasicMaterial({ color: 0x7c8cff, transparent: true, opacity: 0.22, depthWrite: false }))
        );
        scene.add(line);
        return line;
      });

      // Vành đai tiểu hành tinh bên ngoài quỹ đạo cuối (giống vành đai Kuiper)
      const beltCount = isSmall ? 1200 : 2600;
      const beltPos = new Float32Array(beltCount * 3);
      for (let i = 0; i < beltCount; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = maxR + 4 + Math.random() * 4 + (Math.random() - 0.5) * 1.5;
        beltPos.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.9, Math.sin(a) * r], i * 3);
      }
      const beltGeo = track(new THREE.BufferGeometry());
      beltGeo.setAttribute('position', new THREE.BufferAttribute(beltPos, 3));
      const belt = new THREE.Points(
        beltGeo,
        track(
          new THREE.PointsMaterial({ size: 0.16, color: 0xa8a29e, transparent: true, opacity: 0.55, depthWrite: false })
        )
      );
      scene.add(belt);

      // ── Mặt Trời ──
      const sun = new THREE.Mesh(
        track(new THREE.SphereGeometry(3.2, 64, 64)),
        track(new THREE.MeshBasicMaterial({ map: track(toTexture(sunTexture())), toneMapped: false }))
      );
      scene.add(sun);
      const sunGlows = (
        [
          [13, '#ffd27a', 0.9],
          [24, '#ff9a3d', 0.45],
          [42, '#ff6a1a', 0.18],
        ] as const
      ).map(([size, color, opacity]) => {
        const sp = new THREE.Sprite(
          track(
            new THREE.SpriteMaterial({
              map: glowTex,
              color,
              transparent: true,
              opacity,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            })
          )
        );
        sp.scale.setScalar(size);
        sp.userData.base = size;
        sun.add(sp);
        return sp;
      });
      const sunLabel = document.createElement('div');
      sunLabel.className =
        'pointer-events-none select-none text-[10px] font-bold tracking-[0.3em] uppercase text-amber-200/90 drop-shadow-[0_0_6px_rgba(251,191,36,0.9)]';
      sunLabel.textContent = 'Đầu vào';
      const sunLabelObj = new CSS2DObject(sunLabel);
      sunLabelObj.position.set(0, -4.6, 0);
      sun.add(sunLabelObj);

      // ── Hành tinh ──
      const planets = new Map<string, PlanetRuntime>();
      const cloudTex = track(toTexture(cloudTexture()));
      const pickables: THREE.Object3D[] = [];

      for (const slot of slots) {
        const { spec, step } = slot;
        const fx = FX[step.status];
        const pivot = new THREE.Group();
        scene.add(pivot);

        const tiltGroup = new THREE.Group();
        tiltGroup.rotation.z = spec.tilt;
        pivot.add(tiltGroup);

        const body = new THREE.Mesh(
          track(new THREE.SphereGeometry(spec.radius, 64, 48)),
          track(new THREE.MeshStandardMaterial({ map: track(toTexture(spec.texture())), roughness: 0.92, metalness: 0 }))
        );
        body.userData.stepId = step.id;
        tiltGroup.add(body);
        pickables.push(body);

        let clouds: THREE.Mesh | undefined;
        if (spec.clouds) {
          clouds = new THREE.Mesh(
            track(new THREE.SphereGeometry(spec.radius * 1.025, 64, 48)),
            track(new THREE.MeshStandardMaterial({ map: cloudTex, transparent: true, depthWrite: false }))
          );
          tiltGroup.add(clouds);
        }

        if (spec.ring) {
          const inner = spec.radius * spec.ring.inner;
          const outer = spec.radius * spec.ring.outer;
          const ringGeo = track(new THREE.RingGeometry(inner, outer, 128, 1));
          // Ánh xạ UV theo bán kính để texture chạy từ mép trong ra mép ngoài.
          const pos = ringGeo.attributes.position;
          const uv = ringGeo.attributes.uv;
          const v3 = new THREE.Vector3();
          for (let i = 0; i < pos.count; i++) {
            v3.fromBufferAttribute(pos, i);
            uv.setXY(i, (v3.length() - inner) / (outer - inner), 0.5);
          }
          const ring = new THREE.Mesh(
            ringGeo,
            track(
              new THREE.MeshStandardMaterial({
                map: track(ringTexture(spec.ring.color)),
                transparent: true,
                opacity: spec.ring.opacity,
                side: THREE.DoubleSide,
                depthWrite: false,
                roughness: 1,
              })
            )
          );
          ring.rotation.x = Math.PI / 2;
          tiltGroup.add(ring);
        }

        const halo = new THREE.Sprite(
          track(
            new THREE.SpriteMaterial({
              map: glowTex,
              color: fx.halo,
              transparent: true,
              opacity: fx.haloOpacity,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            })
          )
        );
        halo.scale.setScalar(spec.radius * 4);
        pivot.add(halo);

        // Đám hạt bay quanh hành tinh
        const swarmCount = isSmall ? 60 : 110;
        const swarmPos = new Float32Array(swarmCount * 3);
        for (let i = 0; i < swarmCount; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = spec.radius * (1.55 + Math.random() * 0.9);
          swarmPos.set([Math.cos(a) * r, (Math.random() - 0.5) * spec.radius * 0.5, Math.sin(a) * r], i * 3);
        }
        const swarmGeo = track(new THREE.BufferGeometry());
        swarmGeo.setAttribute('position', new THREE.BufferAttribute(swarmPos, 3));
        const swarm = new THREE.Points(
          swarmGeo,
          track(
            new THREE.PointsMaterial({
              size: 0.22,
              map: glowTex,
              color: fx.particle,
              transparent: true,
              opacity: fx.particleOpacity,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            })
          )
        );
        swarm.rotation.x = 0.35 + Math.random() * 0.4;
        swarm.rotation.z = (Math.random() - 0.5) * 0.6;
        pivot.add(swarm);

        const scanner = new THREE.Mesh(
          track(new THREE.TorusGeometry(spec.radius * 1.4, 0.03, 8, 128)),
          track(new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0, depthWrite: false }))
        );
        scanner.rotation.x = Math.PI / 2.3;
        pivot.add(scanner);

        // Nhãn: bấm để mở popup chi tiết bước
        const root = document.createElement('div');
        root.className = 'select-none flex flex-col items-center gap-1';
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className =
          'pointer-events-auto flex items-center gap-1.5 p-0.5 sm:pr-2 rounded-full bg-slate-950/55 border border-white/10 backdrop-blur-sm hover:border-sky-400/70 hover:bg-slate-900/80 transition-colors cursor-pointer';
        const badge = document.createElement('span');
        badge.dataset.n = String(slot.index + 1);
        const name = document.createElement('span');
        name.className = 'hidden sm:inline text-[11px] font-semibold text-slate-100 whitespace-nowrap';
        name.textContent = step.label;
        chip.append(badge, name);
        chip.addEventListener('click', () => selectRef.current?.(step.id));
        const card = document.createElement('div');
        card.className =
          'pointer-events-none px-2.5 py-1.5 rounded-xl bg-slate-950/80 border border-sky-400/60 backdrop-blur text-center w-max max-w-[200px] shadow-[0_0_22px_rgba(56,189,248,0.35)]';
        const status = document.createElement('span');
        status.className = 'block text-[9px] font-bold uppercase tracking-widest';
        const detail = document.createElement('div');
        detail.className = 'text-[10px] text-slate-300 leading-snug mt-0.5 line-clamp-2';
        card.append(status, detail);
        root.append(chip, card);
        const labelObj = new CSS2DObject(root);
        labelObj.position.set(0, -(spec.radius * (spec.ring ? 1.4 : 1) + 1.1), 0);
        pivot.add(labelObj);

        planets.set(step.id, {
          slot,
          status: step.status,
          pivot,
          body,
          clouds,
          halo,
          swarm,
          scanner,
          pop: 0,
          label: { badge, card, status, detail },
        });
      }
      planetsRef.current = planets;
      applyStatuses(stepsRef.current, planets);

      // ── Đường dữ liệu giữa các quỹ đạo + dòng hạt ──
      const bySlot = [...planets.values()];
      const links: LinkRuntime[] = [];
      const makeLink = (from: PlanetRuntime | null, to: PlanetRuntime) => {
        const lineGeo = track(new THREE.BufferGeometry());
        lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINK_POINTS * 3), 3));
        const line = new THREE.Line(
          lineGeo,
          track(new THREE.LineBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.12, depthWrite: false }))
        );
        line.frustumCulled = false;
        scene.add(line);
        const flowGeo = track(new THREE.BufferGeometry());
        flowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLOW_POINTS * 3), 3));
        const flow = new THREE.Points(
          flowGeo,
          track(
            new THREE.PointsMaterial({
              size: 0.55,
              map: glowTex,
              color: 0x67e8f9,
              transparent: true,
              opacity: 0,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            })
          )
        );
        flow.frustumCulled = false;
        scene.add(flow);
        links.push({ from, to, line, flow, offset: Math.random() });
      };
      const maxLevel = Math.max(0, ...bySlot.map((p) => p.slot.level));
      for (let L = 0; L <= maxLevel; L++) {
        const current = bySlot.filter((p) => p.slot.level === L);
        const prev = bySlot.filter((p) => p.slot.level === L - 1);
        for (const to of current) {
          if (L === 0) makeLink(null, to);
          else for (const from of prev) makeLink(from, to);
        }
      }

      // ── Camera + điều khiển ──
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.enablePan = false;
      controls.minDistance = 10;
      controls.maxDistance = (maxR + 12) * 4;
      controls.maxPolarAngle = Math.PI * 0.47;
      controls.minPolarAngle = Math.PI * 0.08;
      controls.autoRotate = !reduceMotion;
      controls.autoRotateSpeed = 0.25;
      controls.rotateSpeed = 0.6;
      controls.zoomSpeed = 0.7;

      const viewDir = new THREE.Vector3(0.15, Math.sin(0.62), Math.cos(0.62)).normalize();
      const homePos = new THREE.Vector3();
      const computeHome = () => {
        const span = maxR + 9;
        const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
        const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
        const dist = Math.max(span / Math.tan(hHalf), (span * 0.62) / Math.tan(vHalf)) * 0.96;
        homePos.copy(viewDir).multiplyScalar(dist);
      };

      let flyHomeUntil = 0;
      let followPausedUntil = 0;
      controls.addEventListener('start', () => {
        followPausedUntil = Number.POSITIVE_INFINITY;
        flyHomeUntil = 0;
        controls.autoRotate = false;
      });
      controls.addEventListener('end', () => {
        followPausedUntil = performance.now() + 8000;
        setTimeout(() => {
          if (performance.now() >= followPausedUntil) controls.autoRotate = !reduceMotion;
        }, 8100);
      });
      resetRef.current = () => {
        flyHomeUntil = performance.now() + 2200;
        followPausedUntil = 0;
        controls.autoRotate = !reduceMotion;
      };

      const resize = () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        renderer.setSize(w, h);
        labelRenderer.setSize(w, h);
        camera.aspect = w / Math.max(h, 1);
        camera.updateProjectionMatrix();
        computeHome();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(container);
      resize();
      camera.position.copy(homePos).multiplyScalar(2.3).add(new THREE.Vector3(0, 30, 0));
      flyHomeUntil = performance.now() + 3200;

      // Bấm vào hành tinh (không tính thao tác kéo xoay)
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      let downAt: { x: number; y: number } | null = null;
      const onDown = (e: PointerEvent) => (downAt = { x: e.clientX, y: e.clientY });
      const onUp = (e: PointerEvent) => {
        if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObjects(pickables, false)[0];
        if (hit) selectRef.current?.(hit.object.userData.stepId);
      };
      renderer.domElement.addEventListener('pointerdown', onDown);
      renderer.domElement.addEventListener('pointerup', onUp);

      let visible = true;
      const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
      io.observe(container);

      const clock = new THREE.Clock();
      const tmpColor = new THREE.Color();
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const ctrl = new THREE.Vector3();
      const tmp = new THREE.Vector3();
      const focus = new THREE.Vector3();
      const origin = new THREE.Vector3();
      const curve = new THREE.QuadraticBezierCurve3(a, ctrl, b);
      let orbitTime = 0;
      let frame = 0;

      const tick = () => {
        frame = requestAnimationFrame(tick);
        if (!visible || document.hidden) {
          clock.getDelta();
          return;
        }
        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;
        const k = 1 - Math.exp(-dt * 3);
        orbitTime += dt * motion;

        for (const layer of starLayers) layer.rotation.y += dt * layer.userData.speed * motion;
        nebulae.forEach((n, i) => ((n.material as THREE.SpriteMaterial).rotation += dt * 0.006 * (i % 2 ? 1 : -1)));
        belt.rotation.y += dt * 0.01 * motion;
        sun.rotation.y += dt * 0.06 * motion;
        sunGlows.forEach((g, i) => g.scale.setScalar(g.userData.base * (1 + Math.sin(t * (0.8 + i * 0.3)) * 0.04 * motion)));

        const running: THREE.Vector3[] = [];
        for (const p of planets.values()) {
          const { slot } = p;
          const fx = FX[p.status];
          const ang = slot.phase + orbitTime * angularSpeed(slot.orbitRadius);
          p.pivot.position.set(Math.cos(ang) * slot.orbitRadius, 0, Math.sin(ang) * slot.orbitRadius);

          p.body.rotation.y += dt * slot.spec.spin * motion;
          if (p.clouds) p.clouds.rotation.y += dt * slot.spec.spin * 1.25 * motion;
          p.body.material.color.lerp(tmpColor.set(fx.tint), k);
          p.body.material.emissive.lerp(tmpColor.set(p.status === 'running' ? '#0c4a6e' : '#000000'), k);

          const hm = p.halo.material as THREE.SpriteMaterial;
          hm.color.lerp(tmpColor.set(fx.halo), k);
          const pulse = p.status === 'running' ? 0.25 * Math.sin(t * 4) * motion : 0;
          hm.opacity += (fx.haloOpacity + pulse - hm.opacity) * k;
          p.pop *= Math.exp(-dt * 3);
          const r = slot.spec.radius;
          p.halo.scale.setScalar(r * (p.status === 'running' ? 6 : 4) * (1 + p.pop * 0.9));
          p.body.scale.setScalar(1 + p.pop * 0.25);

          const sm = p.swarm.material;
          sm.color.lerp(tmpColor.set(fx.particle), k);
          sm.opacity += (fx.particleOpacity - sm.opacity) * k;
          p.swarm.rotation.y += dt * fx.particleSpeed * motion;

          const scm = p.scanner.material;
          scm.opacity += ((p.status === 'running' ? 0.9 : 0) - scm.opacity) * k;
          p.scanner.rotation.z += dt * 1.6 * motion;
          p.scanner.scale.setScalar(1 + (p.status === 'running' ? Math.sin(t * 3) * 0.08 : 0));

          if (p.status === 'running') running.push(p.pivot.position);
        }

        // Quỹ đạo sáng lên theo trạng thái của các hành tinh trên đó
        orbitLines.forEach((line, L) => {
          const onOrbit = [...planets.values()].filter((p) => p.slot.level === L);
          const isRunning = onOrbit.some((p) => p.status === 'running');
          const isDone = onOrbit.length > 0 && onOrbit.every((p) => p.status === 'done' || p.status === 'skipped');
          line.material.color.lerp(tmpColor.set(isRunning ? '#38bdf8' : isDone ? '#34d399' : '#7c8cff'), k);
          line.material.opacity += ((isRunning ? 0.6 : isDone ? 0.38 : 0.22) - line.material.opacity) * k;
        });

        for (const link of links) {
          a.copy(link.from ? link.from.pivot.position : origin);
          b.copy(link.to.pivot.position);
          const dist = a.distanceTo(b);
          ctrl.copy(a).lerp(b, 0.5).setY(2 + dist * 0.18);
          const fromStatus = link.from ? link.from.status : 'done';
          const toStatus = link.to.status;
          const flowing = (fromStatus === 'done' || fromStatus === 'skipped') && toStatus === 'running';
          const travelled = fromStatus === 'done' && (toStatus === 'done' || toStatus === 'error');
          const lm = link.line.material;
          lm.color.lerp(tmpColor.set(flowing ? '#67e8f9' : travelled ? '#34d399' : '#6366f1'), k);
          lm.opacity += ((flowing ? 0.85 : travelled ? 0.4 : 0.12) - lm.opacity) * k;

          const linePos = link.line.geometry.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i < LINK_POINTS; i++) {
            curve.getPoint(i / (LINK_POINTS - 1), tmp);
            linePos.setXYZ(i, tmp.x, tmp.y, tmp.z);
          }
          linePos.needsUpdate = true;

          const fm = link.flow.material;
          fm.opacity += ((flowing ? 1 : 0) - fm.opacity) * k;
          if (fm.opacity > 0.01) {
            const flowPos = link.flow.geometry.getAttribute('position') as THREE.BufferAttribute;
            for (let i = 0; i < FLOW_POINTS; i++) {
              curve.getPoint((link.offset + i / FLOW_POINTS + t * 0.45 * motion) % 1, tmp);
              flowPos.setXYZ(i, tmp.x, tmp.y, tmp.z);
            }
            flowPos.needsUpdate = true;
          }
        }

        // Camera: bay về vị trí mặc định khi mở/đặt lại; nhìn theo hành tinh đang chạy
        const now = performance.now();
        if (now < flyHomeUntil) {
          camera.position.lerp(homePos, 1 - Math.exp(-dt * 2.2));
          controls.target.lerp(origin, 1 - Math.exp(-dt * 2.2));
        } else if (now > followPausedUntil) {
          focus.set(0, 0, 0);
          if (running.length) {
            running.forEach((v) => focus.add(v));
            focus.divideScalar(running.length).multiplyScalar(0.55);
          }
          controls.target.lerp(focus, 1 - Math.exp(-dt * 0.8));
        }
        controls.update();

        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
      };
      tick();

      return () => {
        cancelAnimationFrame(frame);
        ro.disconnect();
        io.disconnect();
        controls.dispose();
        renderer.domElement.removeEventListener('pointerdown', onDown);
        renderer.domElement.removeEventListener('pointerup', onUp);
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        renderer.domElement.remove();
        labelRenderer.domElement.remove();
        planetsRef.current = new Map();
        resetRef.current = () => {};
      };
    }, [layoutKey]);

    useEffect(() => {
      applyStatuses(steps, planetsRef.current);
    }, [steps, layoutKey]);

    return (
      <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
        {failed && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 p-6 text-center">
            Trình duyệt không hỗ trợ WebGL nên không hiển thị được hệ mặt trời 3D. Tiến trình vẫn hiện ở bảng bên phải.
          </div>
        )}
      </div>
    );
  }
);

SolarSystemScene.displayName = 'SolarSystemScene';

const chipOf = (badge: HTMLElement) => badge.parentElement as HTMLElement;

/** Cập nhật trạng thái + nhãn cho các hành tinh mà không dựng lại cảnh. */
function applyStatuses(steps: StudioStep[], planets: Map<string, PlanetRuntime>) {
  for (const step of steps) {
    const p = planets.get(step.id);
    if (!p) continue;
    if (p.status !== step.status && (step.status === 'done' || step.status === 'error')) p.pop = 1;
    p.status = step.status;
    const { badge, card, status, detail } = p.label;
    badge.className = `flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold border tabular-nums ${BADGE_CLASS[step.status]}`;
    badge.textContent = step.status === 'done' ? '✓' : step.status === 'error' ? '!' : badge.dataset.n || '';
    // Chỉ hiện thẻ chữ khi lỗi; bước đang chạy đã có huy hiệu phát sáng + vòng quét,
    // tránh nhiều thẻ đè nhau khi các agent chạy song song.
    const showCard = step.status === 'error';
    chipOf(badge).style.borderColor = step.status === 'running' ? 'rgba(56,189,248,0.8)' : '';
    chipOf(badge).style.boxShadow = step.status === 'running' ? '0 0 18px rgba(56,189,248,0.45)' : '';
    card.style.display = showCard ? '' : 'none';
    card.style.borderColor = step.status === 'error' ? 'rgba(244,63,94,0.75)' : '';
    status.textContent = STATUS_TEXT[step.status];
    status.className = `block text-[9px] font-bold uppercase tracking-widest ${
      step.status === 'error' ? 'text-rose-300' : 'text-sky-300'
    }`;
    detail.textContent = step.detail || '';
    detail.style.display = step.detail ? '' : 'none';
  }
}

export default SolarSystemScene;
