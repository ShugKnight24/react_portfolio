import { FC, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { sound } from '../arcade/audio/audioSynth';
import styles from './DetroitSkylineScene.module.css';
import {
  BUILDING_DEFS,
  CAESARS,
  CHANNEL_BACK_Z,
  CHANNEL_FRONT_Z,
  RIVERFRONT_Z,
  WINDSOR_DEFS,
  detroitBankX,
  windsorBankX,
} from './skylineData';

// ── Color Palettes & Interpolation Helpers ──

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function dayFactor(t: number): number {
  const raw = 0.5 + 0.5 * Math.cos((t - 0.5) * Math.PI * 2);
  return smoothstep(Math.max(0, Math.min(1, (raw - 0.1) / 0.8)));
}

function glowFactor(t: number): number {
  const d = Math.min(Math.abs(t - 0.22), Math.abs(t - 0.78));
  return smoothstep(Math.max(0, 1 - d / 0.07));
}

function lerpHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff,
    ag = (a >> 8) & 0xff,
    ab = a & 0xff;
  const br = (b >> 16) & 0xff,
    bg = (b >> 8) & 0xff,
    bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

function tintHex(base: number, tint: number, amount: number): number {
  return lerpHex(base, tint, amount);
}

const NIGHT = {
  skyTop: 0x020510,
  skyHorizon: 0x150a02,
  fog: 0x0a0408,
  clear: 0x030108,
  ambient: 0x080c14,
  water: 0x0a1a3a,
  haze: 0x2a1800,
  waterline: 0xff9944,
};

const DAY = {
  skyTop: 0x4499dd,
  skyHorizon: 0xbbddff,
  fog: 0x7799bb,
  clear: 0x5588aa,
  ambient: 0x88aacc,
  water: 0x2299aa,
  haze: 0x667788,
  waterline: 0xddcc88,
};

const GLOW_TINT = {
  skyTop: 0x8a3060,
  skyHorizon: 0xff5020,
  fog: 0x6a3020,
  clear: 0x3a1808,
};

const RENCEN_COLOR = 0x3366aa;
const RENCEN_EMISSIVE = 0x1155cc;
const GLASS_COLOR = 0x1a3850;
const GLASS_EMISSIVE = 0x225588;
const WARM_COLOR = 0x4a2818;
const WARM_EMISSIVE = 0x994400;
const BG_COLOR = 0x121220;
const BG_EMISSIVE = 0x281e0c;

const DAY_BUILDING: Record<string, { color: number; emissive: number }> = {
  rencen: { color: 0xc0eaff, emissive: 0x77bbee },
  glass: { color: 0x90d0f0, emissive: 0x66aadd },
  warm: { color: 0xf5ddc0, emissive: 0xcc9977 },
  bg: { color: 0xd0d0e5, emissive: 0x99aabb },
};

const NIGHT_BUILDING: Record<string, { color: number; emissive: number }> = {
  rencen: { color: RENCEN_COLOR, emissive: RENCEN_EMISSIVE },
  glass: { color: GLASS_COLOR, emissive: GLASS_EMISSIVE },
  warm: { color: WARM_COLOR, emissive: WARM_EMISSIVE },
  bg: { color: BG_COLOR, emissive: BG_EMISSIVE },
};

function createWindowTexture(cols: number, rows: number, litProbability: number, type: string) {
  const cw = 64,
    ch = 128;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const baseFills: Record<string, string> = {
    rencen: '#1a3355',
    glass: '#0d2030',
    warm: '#2a1808',
    bg: '#0e0e18',
  };
  ctx.fillStyle = baseFills[type] || baseFills.bg;
  ctx.fillRect(0, 0, cw, ch);

  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  const padX = 4,
    padY = 4;
  const gapX = 2,
    gapY = 2;
  const cellW = (cw - padX * 2 - gapX * (cols - 1)) / cols;
  const cellH = (ch - padY * 2 - gapY * (rows - 1)) / rows;

  const litColors: Record<string, string[]> = {
    rencen: ['#88bbff', '#aaccff', '#6699dd'],
    glass: ['#77bbdd', '#99ddee', '#5599bb'],
    warm: ['#ffcc66', '#ffaa33', '#ee9922'],
    bg: ['#ccccdd', '#aaaacc', '#8888aa'],
  };
  const palette = litColors[type] || litColors.bg;
  const unlitColors = ['#0a0a12', '#080810', '#0c0c16'];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = padX + c * (cellW + gapX);
      const wy = padY + r * (cellH + gapY);
      const isLit = Math.random() < litProbability;
      if (isLit) {
        ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
      } else {
        ctx.fillStyle = unlitColors[Math.floor(Math.random() * unlitColors.length)];
        ctx.globalAlpha = 0.8;
      }
      ctx.fillRect(wx, wy, Math.max(1, cellW - 1), Math.max(1, cellH - 1));
    }
  }
  ctx.globalAlpha = 1.0;

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeMaterial(type: string) {
  const c = {
    rencen: { color: RENCEN_COLOR, emissive: RENCEN_EMISSIVE, ei: 1.0, opacity: 0.97, specular: 0x6688bb, shininess: 80 },
    glass: { color: GLASS_COLOR, emissive: GLASS_EMISSIVE, ei: 0.8, opacity: 0.92, specular: 0x88aacc, shininess: 100 },
    warm: { color: WARM_COLOR, emissive: WARM_EMISSIVE, ei: 0.75, opacity: 0.95, specular: 0x443322, shininess: 25 },
    bg: { color: BG_COLOR, emissive: BG_EMISSIVE, ei: 0.5, opacity: 0.92, specular: 0x333333, shininess: 15 },
  }[type] || { color: BG_COLOR, emissive: BG_EMISSIVE, ei: 0.5, opacity: 0.92, specular: 0x333333, shininess: 15 };

  return new THREE.MeshPhongMaterial({
    color: c.color,
    emissive: c.emissive,
    emissiveIntensity: c.ei,
    transparent: type !== 'rencen',
    opacity: c.opacity,
    specular: c.specular,
    shininess: c.shininess,
  });
}

function makeReflectionMat(type: string, matColor: number, matEmit: number) {
  const refColor = new THREE.Color(matColor).lerp(new THREE.Color(0x041028), 0.4);
  const refEmit = new THREE.Color(matEmit).lerp(new THREE.Color(0x0a2255), 0.3);
  const intensities: Record<string, { ei: number; opacity: number }> = {
    rencen: { ei: 0.3, opacity: 0.32 },
    glass: { ei: 0.25, opacity: 0.26 },
    warm: { ei: 0.12, opacity: 0.2 },
    bg: { ei: 0.04, opacity: 0.1 },
  };
  const i = intensities[type] || intensities.bg;
  return new THREE.MeshPhongMaterial({
    color: refColor,
    emissive: refEmit,
    emissiveIntensity: i.ei,
    transparent: true,
    opacity: i.opacity,
    depthWrite: false,
  });
}

interface LandmarkDef {
  id: string;
  name: string;
  tag: string;
  desc: string;
}

// World-space focus point per landmark: camera glides here and a spotlight marks it
// (camX / camY optionally offset the camera from the look target; default camX = x, camY = 2.5)
interface LandmarkFocus {
  x: number;
  y: number;
  z: number;
  dist: number;
  camX?: number;
  camY?: number;
}
const LANDMARK_FOCUS: Record<string, LandmarkFocus> = {
  rencen: { x: 0, y: 14, z: 0, dist: 58 },
  penobscot: { x: -18, y: 14, z: 0, dist: 46 },
  ambassador: { x: -92, y: 10, z: -14, dist: 45, camX: -97, camY: 3 },
  gordie: { x: -127, y: 17, z: -80, dist: -19, camX: -108, camY: 4 },
  mcstation: { x: -48, y: 13, z: -4, dist: 50 },
};

const LANDMARKS: LandmarkDef[] = [
  {
    id: 'rencen',
    name: 'Renaissance Center',
    tag: '727 FT • 5 TOWERS • GM GLOBAL HQ',
    desc: 'The defining cylindrical centerpiece of the Detroit riverfront, crowned by four surrounding towers and neon rings that illuminate the international waterway.',
  },
  {
    id: 'penobscot',
    name: 'Penobscot Building',
    tag: '565 FT • ART DECO • 1928 ICON',
    desc: 'The historic 47-story Art Deco masterpiece featuring stepped brick setbacks and a glowing red sphere beacon that has guided aviators for almost a century.',
  },
  {
    id: 'ambassador',
    name: 'Ambassador Bridge',
    tag: '1929 • SUSPENSION SPAN • DETROIT TO WINDSOR',
    desc: 'Opened in 1929, this steel suspension bridge hangs a 1,850 foot main span between green lattice towers and carries more trade than any other crossing between the United States and Canada.',
  },
  {
    id: 'gordie',
    name: 'Gordie Howe Bridge',
    tag: '2026 • CABLE-STAYED • DETROIT TO WINDSOR',
    desc: 'Named for hockey legend Gordie Howe and opened in July 2026, it is the longest cable-stayed bridge in North America, hanging an 853 metre main span from two A-shaped towers 220 metres tall.',
  },
  {
    id: 'mcstation',
    name: 'Michigan Central Station',
    tag: 'CORKTOWN • TECH & MOBILITY RENAISSANCE',
    desc: 'The historic Beaux-Arts train depot reborn as the premier innovation and software mobility campus of the 21st century.',
  },
];

export const DetroitSkylineScene: FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const setTargetTimeRef = useRef<((t: number) => void) | null>(null);
  const focusLandmarkRef = useRef<((id: string) => void) | null>(null);
  const [activePreset, setActivePreset] = useState<'midnight' | 'sunrise' | 'noon' | 'sunset'>('midnight');
  const [selectedLandmark, setSelectedLandmark] = useState<LandmarkDef>(LANDMARKS[0]);
  const [detroitTime, setDetroitTime] = useState<string>('');

  // Clock
  useEffect(() => {
    const updateTime = () => {
      try {
        const now = new Date();
        const estString = now.toLocaleTimeString('en-US', {
          timeZone: 'America/Detroit',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setDetroitTime(`${estString} EST`);
      } catch {
        setDetroitTime('ONLINE');
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 3D Scene Lifecycle
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    const CYCLE_SECONDS = 270;

    // Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: false });
    } catch (err) {
      console.warn('WebGL unavailable for Detroit Skyline scene:', err);
      return;
    }
    renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2));
    renderer.setClearColor(NIGHT.clear, 1);
    container.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';


    // Scene + Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 600);
    camera.position.set(0, 2.5, 65);
    camera.lookAt(0, 10, 0);
    scene.fog = new THREE.Fog(NIGHT.fog, 100, 260);

    function resize() {
      if (!container) return;
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      const aspect = w / h;
      camera.aspect = aspect;
      const hFovRad = (85 * Math.PI) / 180;
      camera.fov = Math.min(2 * Math.atan(Math.tan(hFovRad / 2) / aspect) * (180 / Math.PI), 85);
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    // Sky gradient plane
    const skyGeo = new THREE.PlaneGeometry(700, 140);
    const skyColorAttr = new Float32Array(12);
    skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColorAttr, 3));
    const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.FrontSide });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.position.set(-100, 55, -90);
    scene.add(skyMesh);

    // Moon
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xe8e0d0, transparent: true, opacity: 0.95 });
    const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(4.5, 32, 32), moonMat);
    moonMesh.position.set(-55, 65, -85);
    scene.add(moonMesh);

    const moonGlowMat = new THREE.MeshBasicMaterial({
      color: 0xbbaa88,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const moonGlow = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 32), moonGlowMat);
    moonGlow.position.copy(moonMesh.position);
    scene.add(moonGlow);

    const moonCoronaMat = new THREE.MeshBasicMaterial({
      color: 0x998866,
      transparent: true,
      opacity: 0.06,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const moonCorona = new THREE.Mesh(new THREE.SphereGeometry(18, 32, 32), moonCoronaMat);
    moonCorona.position.copy(moonMesh.position);
    scene.add(moonCorona);

    // Sun
    const SUN_HIGH = new THREE.Color(0xffeedd);
    const SUN_LOW = new THREE.Color(0xff6622);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0 });
    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 32), sunMat);
    sunMesh.position.set(0, -20, -85);
    scene.add(sunMesh);

    const sunGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(14, 32, 32), sunGlowMat);
    sunGlow.position.copy(sunMesh.position);
    scene.add(sunGlow);

    const sunCoronaMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const sunCorona = new THREE.Mesh(new THREE.SphereGeometry(24, 32, 32), sunCoronaMat);
    sunCorona.position.copy(sunMesh.position);
    scene.add(sunCorona);

    // Clouds
    const clouds: any[] = [];
    [
      { x: -40, y: 50, z: -70, w: 60, h: 6, opacity: 0.04, speed: 0.3 },
      { x: 30, y: 58, z: -75, w: 80, h: 8, opacity: 0.03, speed: 0.2 },
      { x: -80, y: 42, z: -65, w: 50, h: 5, opacity: 0.025, speed: 0.35 },
      { x: 60, y: 46, z: -68, w: 70, h: 7, opacity: 0.03, speed: 0.15 },
      { x: 0, y: 55, z: -80, w: 100, h: 10, opacity: 0.02, speed: 0.1 },
    ].forEach((cd) => {
      const cMat = new THREE.MeshBasicMaterial({
        color: 0x888888,
        transparent: true,
        opacity: cd.opacity,
        depthWrite: false,
      });
      const cMesh = new THREE.Mesh(new THREE.PlaneGeometry(cd.w, cd.h), cMat);
      cMesh.position.set(cd.x, cd.y, cd.z);
      scene.add(cMesh);
      clouds.push({ mesh: cMesh, mat: cMat, speed: cd.speed, startX: cd.x, baseOp: cd.opacity });
    });

    // Atmospheric Haze
    const hazeMat = new THREE.MeshBasicMaterial({
      color: NIGHT.haze,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
    });
    const hazeMesh = new THREE.Mesh(new THREE.PlaneGeometry(500, 14), hazeMat);
    hazeMesh.position.set(0, 1.5, -8);
    scene.add(hazeMesh);

    // Waterline Glow
    const wlMat = new THREE.MeshBasicMaterial({
      color: NIGHT.waterline,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const wlMesh = new THREE.Mesh(new THREE.PlaneGeometry(120, 0.8), wlMat);
    wlMesh.position.set(0, -0.3, 20);
    scene.add(wlMesh);
    // Windsor riverfront waterline (Detroit bank east of downtown keeps its own)
    const wlWindsor = new THREE.Mesh(new THREE.PlaneGeometry(228, 0.3), wlMat);
    wlWindsor.position.set(-216, -0.3, 12.4);
    scene.add(wlWindsor);
    const wlEast = new THREE.Mesh(new THREE.PlaneGeometry(70, 0.8), wlMat);
    wlEast.position.set(95, -0.3, 12.4);
    scene.add(wlEast);

    // Detroit River
    const WX = isMobile ? 60 : 150,
      WY = isMobile ? 12 : 30;
    const waterGeo = new THREE.PlaneGeometry(360, 60, WX, WY);
    waterGeo.rotateX(-Math.PI / 2);
    const waterBaseY = new Float32Array(waterGeo.attributes.position.count);
    for (let i = 0; i < waterBaseY.length; i++) {
      waterBaseY[i] = waterGeo.attributes.position.getY(i);
    }
    const waterMat = new THREE.MeshPhongMaterial({
      color: NIGHT.water,
      specular: 0x3366aa,
      shininess: 100,
      transparent: true,
      opacity: 0.92,
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.set(-60, -1.5, 38);
    scene.add(waterMesh);

    // River Current Particles
    const currentParticleCount = isMobile ? 30 : 60;
    const currentGeo = new THREE.BufferGeometry();
    const currentPositions = new Float32Array(currentParticleCount * 3);
    const currentSpeeds = new Float32Array(currentParticleCount);
    for (let i = 0; i < currentParticleCount; i++) {
      currentPositions[i * 3] = (Math.random() - 0.5) * 240;
      currentPositions[i * 3 + 1] = -0.5 + Math.random() * 1.0;
      currentPositions[i * 3 + 2] = 30 + Math.random() * 20;
      currentSpeeds[i] = 0.03 + Math.random() * 0.02;
    }
    currentGeo.setAttribute('position', new THREE.BufferAttribute(currentPositions, 3));
    const currentMat = new THREE.PointsMaterial({
      color: 0xccddff,
      size: 0.15,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    });
    const currentParticles = new THREE.Points(currentGeo, currentMat);
    currentParticles.position.set(0, -1.0, 0);
    scene.add(currentParticles);

    // Foam wake lines
    const foamLines: any[] = [];
    for (let i = 0; i < 4; i++) {
      const lineLen = 10 + Math.random() * 10;
      const startX = (Math.random() - 0.5) * 200;
      const lineZ = 32 + Math.random() * 16;
      const lineY = -0.8 + Math.random() * 0.4;
      const pts = [
        new THREE.Vector3(startX, lineY, lineZ),
        new THREE.Vector3(startX + lineLen, lineY, lineZ + (Math.random() - 0.5) * 1.5),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.08 + Math.random() * 0.04,
        depthWrite: false,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      scene.add(line);
      foamLines.push({
        line,
        geo: lineGeo,
        speed: 0.025 + Math.random() * 0.02,
        lineLen,
        baseZ: lineZ,
        baseY: lineY,
      });
    }

    // Boats
    const boats: any[] = [];
    const boatMat = new THREE.MeshPhongMaterial({ color: 0x334455, emissive: 0x111122, emissiveIntensity: 0.2 });
    const boatLightMat = new THREE.MeshBasicMaterial({ color: 0xff4422, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 4; i++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.5), boatMat);
      boat.add(hull);
      const bLight = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), boatLightMat);
      bLight.position.set(0.5, 0.2, 0);
      boat.add(bLight);
      boat.position.set(-30 + i * 20 + Math.random() * 10, -1.2, 42 + Math.random() * 12);
      boat.rotation.y = Math.random() * 0.4 - 0.2;
      boat.userData.speed = 0.3 + Math.random() * 0.4;
      boat.userData.startX = boat.position.x;
      scene.add(boat);
      boats.push(boat);
    }

    // Buildings & Inverted Reflections
    const buildingMats: any[] = [];
    const buildingBaseEmissive: number[] = [];
    const buildingTypes: string[] = [];
    const reflectionGroup = new THREE.Group();
    const outlineMats: any[] = [];
    const rimGlowMats: any[] = [];

    BUILDING_DEFS.forEach((def) => {
      const { x, z, w, d, h, type, shape, setback } = def;
      const isRC = type === 'rencen',
        isBg = type === 'bg';
      const matColor = isRC ? RENCEN_COLOR : isBg ? BG_COLOR : WARM_COLOR;
      const matEmit = isRC ? RENCEN_EMISSIVE : isBg ? BG_EMISSIVE : WARM_EMISSIVE;

      const winCols = Math.max(2, Math.min(8, Math.floor(w * 1.8)));
      const winRows = Math.max(3, Math.min(16, Math.floor(h * 0.9)));
      const winLitProb = 0.45;

      const addMat = (mat: any) => {
        buildingMats.push(mat);
        buildingBaseEmissive.push(mat.emissiveIntensity);
        buildingTypes.push(type);
      };

      const addOutline = (geo: any, pos: any) => {
        const edges = new THREE.EdgesGeometry(geo);
        const outlineMat = new THREE.LineBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
        });
        const outline = new THREE.LineSegments(edges, outlineMat);
        outline.position.copy(pos);
        scene.add(outline);
        outlineMats.push(outlineMat);
      };

      const addRimGlow = (bx: number, bz: number, bw: number, bd: number, bh: number) => {
        if (bh < 8) return;
        const rimGeo = new THREE.BoxGeometry(bw + 0.3, 0.15, bd + 0.3);
        const rimMat = new THREE.MeshBasicMaterial({
          color: 0xff6622,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.position.set(bx, bh + 0.08, bz);
        scene.add(rim);
        rimGlowMats.push(rimMat);
      };

      if (shape === 'cylinder') {
        const r = w / 2;
        const geo = new THREE.CylinderGeometry(r, r, h, 24);
        const mat = makeMaterial(type);
        if (type !== 'bg') {
          mat.map = createWindowTexture(winCols, winRows, winLitProb, type);
        }
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, h / 2, z);
        scene.add(mesh);
        addMat(mat);
        addOutline(geo, mesh.position);
        addRimGlow(x, z, w, w, h);

        const refMat = makeReflectionMat(type, matColor, matEmit);
        const rm = new THREE.Mesh(geo, refMat);
        rm.position.set(x, -h / 2 - 3, z + 2);
        rm.scale.set(1, -1, 1);
        reflectionGroup.add(rm);
      } else if (setback) {
        const baseGeo = new THREE.BoxGeometry(w, setback[0].h, d);
        const baseMat = makeMaterial(type);
        baseMat.map = createWindowTexture(winCols, Math.max(3, Math.floor(setback[0].h * 0.9)), winLitProb, type);
        const baseMesh = new THREE.Mesh(baseGeo, baseMat);
        baseMesh.position.set(x, setback[0].h / 2, z);
        scene.add(baseMesh);
        addMat(baseMat);
        addOutline(baseGeo, baseMesh.position);

        for (let si = 0; si < setback.length; si++) {
          const sb = setback[si];
          const tierH = si + 1 < setback.length ? setback[si + 1].h - sb.h : h - sb.h;
          const tierGeo = new THREE.BoxGeometry(w * sb.scale, tierH, d * sb.scale);
          const tierMat = makeMaterial(type);
          tierMat.map = createWindowTexture(
            Math.max(2, Math.floor(winCols * sb.scale)),
            Math.max(2, Math.floor(tierH * 0.9)),
            winLitProb,
            type
          );
          const tierMesh = new THREE.Mesh(tierGeo, tierMat);
          tierMesh.position.set(x, sb.h + tierH / 2, z);
          scene.add(tierMesh);
          addMat(tierMat);
          addOutline(tierGeo, tierMesh.position);
        }
        addRimGlow(x, z, w * (setback[setback.length - 1].scale || 0.7), d * (setback[setback.length - 1].scale || 0.7), h);

        const refGeo = new THREE.BoxGeometry(w, h, d);
        const refMat = makeReflectionMat(type, matColor, matEmit);
        const rm = new THREE.Mesh(refGeo, refMat);
        rm.position.set(x, -h / 2 - 3, z + 2);
        rm.scale.set(1, -1, 1);
        reflectionGroup.add(rm);
      } else {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = makeMaterial(type);
        mat.map = createWindowTexture(winCols, winRows, winLitProb, type);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, h / 2, z);
        scene.add(mesh);
        addMat(mat);
        addOutline(geo, mesh.position);
        addRimGlow(x, z, w, d, h);

        const refMat = makeReflectionMat(type, matColor, matEmit);
        const rm = new THREE.Mesh(geo, refMat);
        rm.position.set(x, -h / 2 - 3, z + 2);
        rm.scale.set(1, -1, 1);
        reflectionGroup.add(rm);
      }
    });
    scene.add(reflectionGroup);

    // RenCen crown ring
    const crownGeo = new THREE.TorusGeometry(2.8, 0.12, 8, 60);
    const crownMat = new THREE.MeshBasicMaterial({ color: 0x0066ff, transparent: true, opacity: 1.0 });
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.rotation.x = Math.PI / 2;
    crown.position.set(0, 30.4, 0);
    scene.add(crown);

    const crownRefMat = new THREE.MeshBasicMaterial({ color: 0x003399, transparent: true, opacity: 0.25, depthWrite: false });
    const crownRef = new THREE.Mesh(crownGeo, crownRefMat);
    crownRef.rotation.x = Math.PI / 2;
    crownRef.position.set(0, -30.4 - 3, 2);
    crownRef.scale.set(1, 1, -1);
    reflectionGroup.add(crownRef);

    // Antenna spires & beacons
    const antennaMat = new THREE.MeshPhongMaterial({ color: 0x556677, emissive: 0x222233, emissiveIntensity: 0.2 });
    const antennaBeaconMats: any[] = [];
    [
      { x: 0, h: 30, ah: 6 },
      { x: -18, h: 24, ah: 5 }, // Penobscot red beacon spire
      { x: -14, h: 26, ah: 4 }, // Comerica spire
    ].forEach(({ x, h, ah }) => {
      const spireGeo = new THREE.CylinderGeometry(0.08, 0.15, ah, 6);
      const spire = new THREE.Mesh(spireGeo, antennaMat);
      spire.position.set(x, h + ah / 2, 0);
      scene.add(spire);

      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.9 });
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), beaconMat);
      beacon.position.set(x, h + ah + 0.2, 0);
      scene.add(beacon);
      antennaBeaconMats.push(beaconMat);
    });

    // Street Lamps along Riverfront Promenade
    const lampMat = new THREE.MeshPhongMaterial({ color: 0x333340, emissive: 0x111118, emissiveIntensity: 0.15 });
    const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.9 });
    for (let i = -50; i <= 50; i += 8) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.5, 4), lampMat);
      pole.position.set(i, 1.75, 14);
      scene.add(pole);

      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), lampGlowMat);
      lamp.position.set(i, 3.6, 14);
      scene.add(lamp);
    }

    // Promenade Walkway & Seawall
    const promenadeGeo = new THREE.BoxGeometry(120, 0.12, 8);
    const promenadeMat = new THREE.MeshPhongMaterial({ color: 0x2a2a35, emissive: 0x0a0a12, emissiveIntensity: 0.2 });
    const promenadeMesh = new THREE.Mesh(promenadeGeo, promenadeMat);
    promenadeMesh.position.set(0, 0.06, 16);
    scene.add(promenadeMesh);

    const seawallGeo = new THREE.BoxGeometry(120, 1.2, 0.4);
    const seawallMat = new THREE.MeshPhongMaterial({ color: 0x3a3a48, emissive: 0x111118, emissiveIntensity: 0.15 });
    const seawall = new THREE.Mesh(seawallGeo, seawallMat);
    seawall.position.set(0, 0.6, 20.2);
    scene.add(seawall);

    // ── Setup-time geometry helpers (bridges, banks, Windsor) ──
    const upAxis = new THREE.Vector3(0, 1, 0);
    const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    function boxAt(sx: number, sy: number, sz: number, x: number, y: number, z: number) {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      g.translate(x, y, z);
      return g;
    }

    // Box stretched between two points (its local Y follows a -> b)
    function beamGeo(a: THREE.Vector3, b: THREE.Vector3, tx: number, tz: number) {
      const dir = b.clone().sub(a);
      const g = new THREE.BoxGeometry(tx, dir.length(), tz);
      const q = new THREE.Quaternion().setFromUnitVectors(upAxis, dir.normalize());
      g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, v3(1, 1, 1)));
      return g;
    }

    // Vertical wall strip between two xz points
    function wallGeo(x1: number, z1: number, x2: number, z2: number, y0: number, y1: number, thick: number) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const g = new THREE.BoxGeometry(len, y1 - y0, thick);
      g.rotateY(-Math.atan2(z2 - z1, x2 - x1));
      g.translate((x1 + x2) / 2, (y0 + y1) / 2, (z1 + z2) / 2);
      return g;
    }

    // Merge position + normal attributes of many geometries into one draw call
    function mergeGeos(list: THREE.BufferGeometry[]) {
      const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
      let total = 0;
      flat.forEach((g) => (total += g.attributes.position.count));
      const pos = new Float32Array(total * 3);
      const nor = new Float32Array(total * 3);
      let off = 0;
      flat.forEach((g, i) => {
        pos.set(g.attributes.position.array, off * 3);
        nor.set(g.attributes.normal.array, off * 3);
        off += g.attributes.position.count;
        g.dispose();
        if (list[i] !== g) list[i].dispose();
      });
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      return out;
    }

    function vertsGeo(pts: number[]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      return g;
    }

    // Materials that lerp between a night and a day look every frame
    const dnPhongMats: { mat: any; nc: number; dc: number; ne: number; de: number }[] = [];
    function dnPhong(nc: number, dc: number, ne: number, de: number, ei: number, extra: Record<string, unknown> = {}) {
      const mat = new THREE.MeshPhongMaterial({ color: nc, emissive: ne, emissiveIntensity: ei, ...extra });
      dnPhongMats.push({ mat, nc, dc, ne, de });
      return mat;
    }
    // Basic / line / point materials: color + opacity lerp (lights use dOp = 0)
    const dnFlatMats: { mat: any; nc: number; dc: number; nOp: number; dOp: number }[] = [];
    function dnFlat<T extends { color: any; opacity: number }>(mat: T, nc: number, dc: number, nOp: number, dOp: number): T {
      dnFlatMats.push({ mat, nc, dc, nOp, dOp });
      return mat;
    }
    function lightPointsMat(color: number, size: number, nOp: number, dOp = 0) {
      return dnFlat(
        new THREE.PointsMaterial({ color, size, transparent: true, opacity: nOp, depthWrite: false }),
        color,
        color,
        nOp,
        dOp
      );
    }

    // Everything mirrored in the river (y' = -y - 3, nudged toward camera like building reflections)
    const mirrorGroup = new THREE.Group();
    mirrorGroup.scale.set(1, -1, 1);
    mirrorGroup.position.set(0, -3, 2);
    scene.add(mirrorGroup);
    const steelReflMat = dnFlat(
      new THREE.MeshBasicMaterial({ color: 0x0c1a2a, transparent: true, opacity: 0.22, depthWrite: false }),
      0x0c1a2a,
      0x4d6f80,
      0.22,
      0.16
    );

    // Pulsing red aviation beacons on bridge towers
    const bridgeBeaconMat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.8 });
    const beaconGeo = new THREE.SphereGeometry(0.28, 8, 8);
    const gordieBeacons: any[] = [bridgeBeaconMat];
    function addBeacon(x: number, y: number, z: number) {
      const b = new THREE.Mesh(beaconGeo, bridgeBeaconMat);
      b.position.set(x, y, z);
      scene.add(b);
    }

    // ── Ground on both banks + channel shoreline ──
    const groundMat = dnPhong(0x06070b, 0x56604f, 0x020305, 0x151a14, 0.3);
    const shoreMat = dnPhong(0x16161e, 0x8a8478, 0x06060a, 0x2a2824, 0.3);
    const toShape = (pts: [number, number][]) => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const wbx = windsorBankX;
    const dbx = detroitBankX;
    [
      // Windsor (west bank + riverfront facing Detroit)
      toShape([
        [-330, RIVERFRONT_Z],
        [wbx(RIVERFRONT_Z), RIVERFRONT_Z],
        [wbx(0), 0],
        [wbx(CHANNEL_BACK_Z - 2), CHANNEL_BACK_Z - 2],
        [-330, CHANNEL_BACK_Z - 2],
      ]),
      // Detroit (downtown + Delray along the east bank)
      toShape([
        [dbx(RIVERFRONT_Z), RIVERFRONT_Z],
        [130, RIVERFRONT_Z],
        [130, CHANNEL_BACK_Z - 2],
        [dbx(CHANNEL_BACK_Z - 2), CHANNEL_BACK_Z - 2],
        [dbx(-20), -20],
      ]),
    ].forEach((shape) => {
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, groundMat);
      m.position.y = -0.02;
      scene.add(m);
    });
    scene.add(
      new THREE.Mesh(
        mergeGeos([
          wallGeo(-330, RIVERFRONT_Z, wbx(RIVERFRONT_Z), RIVERFRONT_Z, -1.8, 0.3, 0.5),
          wallGeo(wbx(RIVERFRONT_Z), RIVERFRONT_Z, wbx(0), 0, -1.8, 0.4, 0.5),
          wallGeo(wbx(0), 0, wbx(CHANNEL_BACK_Z), CHANNEL_BACK_Z, -1.8, 0.4, 0.5),
          wallGeo(dbx(RIVERFRONT_Z), RIVERFRONT_Z, 130, RIVERFRONT_Z, -1.8, 0.1, 0.5),
          wallGeo(dbx(RIVERFRONT_Z), RIVERFRONT_Z, dbx(-20), -20, -1.8, 0.4, 0.5),
          wallGeo(dbx(-20), -20, dbx(CHANNEL_BACK_Z), CHANNEL_BACK_Z, -1.8, 0.4, 0.5),
        ]),
        shoreMat
      )
    );

    // Channel water (same material + wave field as the main river)
    const CH_SX = isMobile ? 8 : 18,
      CH_SZ = isMobile ? 20 : 48;
    const channelGeo = new THREE.PlaneGeometry(1, 1, CH_SX, CH_SZ);
    channelGeo.rotateX(-Math.PI / 2);
    {
      const p = channelGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) + 0.5;
        const wz = CHANNEL_BACK_Z + (p.getZ(i) + 0.5) * (CHANNEL_FRONT_Z - CHANNEL_BACK_Z);
        p.setXYZ(i, wbx(wz) - 1 + u * (dbx(wz) + 1 - (wbx(wz) - 1)), 0, wz);
      }
    }
    const channelBaseY = new Float32Array(channelGeo.attributes.position.count);
    const channelMesh = new THREE.Mesh(channelGeo, waterMat);
    channelMesh.position.set(0, -1.5, 0);
    scene.add(channelMesh);

    // ── Ambassador Bridge (1929 steel suspension bridge) ──
    const AMB = { z: -14, tD: -60, tW: -114, aD: -44, aW: -130, deckY: 6.5, topY: 18, cableZ: 1.7, deckHalf: 1.6 };
    const ambSteelMat = dnPhong(0x2b3a35, 0x88a397, 0x0c1713, 0x26352f, 0.7, { shininess: 30, specular: 0x334444 });
    const ambConcreteMat = dnPhong(0x24242c, 0xb4ada0, 0x0a0a0e, 0x34302a, 0.4);
    const ambSteel: THREE.BufferGeometry[] = [];
    const ambConcrete: THREE.BufferGeometry[] = [];
    const legZ = (y: number) => 2.1 - 0.4 * (y / AMB.topY);

    [AMB.tD, AMB.tW].forEach((tx) => {
      ambConcrete.push(boxAt(2.6, 1.6, 5.6, tx, 0.6, AMB.z));
      for (const s of [-1, 1]) {
        ambSteel.push(beamGeo(v3(tx, 1.2, AMB.z + s * legZ(1.2)), v3(tx, AMB.topY, AMB.z + s * legZ(AMB.topY)), 0.9, 0.7));
        ambSteel.push(boxAt(1.2, 0.9, 1.0, tx, AMB.topY + 0.3, AMB.z + s * legZ(AMB.topY))); // cable saddle
        addBeacon(tx, AMB.topY + 1.1, AMB.z + s * legZ(AMB.topY));
      }
      // Portal struts + lattice X bracing (open below the roadway)
      const levels = [3.4, 5.4, 9.6, 13.4, 17.2];
      levels.forEach((y, i) => {
        ambSteel.push(boxAt(0.55, i === levels.length - 1 ? 1.0 : 0.4, legZ(y) * 2, tx, y, AMB.z));
        const y2 = levels[i + 1];
        if (y2 === undefined || (y < AMB.deckY && y2 > AMB.deckY)) return;
        for (const s of [-1, 1]) {
          ambSteel.push(beamGeo(v3(tx, y, AMB.z + s * legZ(y)), v3(tx, y2, AMB.z - s * legZ(y2)), 0.2, 0.2));
        }
      });
    });

    // Anchorages
    [AMB.aD, AMB.aW].forEach((ax) => ambConcrete.push(boxAt(4.5, 3.6, 5.2, ax, 1.8, AMB.z)));

    // Main cables: parabolic main span + shallow back spans to the anchorages
    const ambMid = (AMB.tD + AMB.tW) / 2;
    const ambHalf = (AMB.tD - AMB.tW) / 2;
    const cableTop = AMB.topY + 0.6;
    const cableLow = AMB.deckY + 0.8;
    const mainCableY = (x: number) => cableLow + (cableTop - cableLow) * ((x - ambMid) / ambHalf) ** 2;
    const backCableY = (s: number) => cableTop + (3.6 - cableTop) * s - 1.2 * 4 * s * (1 - s);
    const necklace: number[] = [];
    const cableSpans: THREE.Vector3[][] = [];
    for (const cz of [-AMB.cableZ, AMB.cableZ]) {
      const z = AMB.z + cz;
      const main: THREE.Vector3[] = [];
      for (let i = 0; i <= 40; i++) {
        const x = AMB.tW + (i / 40) * (AMB.tD - AMB.tW);
        main.push(v3(x, mainCableY(x), z));
      }
      cableSpans.push(main);
      for (const [tx, ax] of [
        [AMB.tD, AMB.aD],
        [AMB.tW, AMB.aW],
      ]) {
        const back: THREE.Vector3[] = [];
        for (let i = 0; i <= 12; i++) {
          const s = i / 12;
          back.push(v3(tx + (ax - tx) * s, backCableY(s), z));
        }
        cableSpans.push(back);
      }
    }
    cableSpans.forEach((pts) => {
      ambSteel.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.16, 5, false));
      const len = Math.abs(pts[pts.length - 1].x - pts[0].x);
      const n = Math.round(len / 1.35);
      for (let i = 1; i < n; i++) {
        const p = pts[0].clone().lerp(pts[pts.length - 1], i / n);
        // sample the actual span curve at this x
        const k = (i / n) * (pts.length - 1);
        const a = pts[Math.floor(k)];
        const b = pts[Math.min(pts.length - 1, Math.floor(k) + 1)];
        p.y = a.y + (b.y - a.y) * (k - Math.floor(k));
        necklace.push(p.x, p.y + 0.22, p.z);
      }
    });

    // Roadway deck + stiffening truss along the suspended length
    const trussBot = AMB.deckY - 1.4;
    ambConcrete.push(boxAt(AMB.aD - AMB.aW, 0.35, AMB.deckHalf * 2 + 0.2, (AMB.aD + AMB.aW) / 2, AMB.deckY, AMB.z));
    const trussLines: number[] = [];
    for (const s of [-1, 1]) {
      const z = AMB.z + s * AMB.deckHalf;
      ambSteel.push(boxAt(AMB.aD - AMB.aW, 0.28, 0.22, (AMB.aD + AMB.aW) / 2, trussBot, z));
      ambSteel.push(boxAt(AMB.aD - AMB.aW, 0.3, 0.18, (AMB.aD + AMB.aW) / 2, AMB.deckY + 0.3, z));
      for (let x = AMB.aW; x < AMB.aD - 0.01; x += 1.6) {
        trussLines.push(x, trussBot, z, x, AMB.deckY, z);
        trussLines.push(x, trussBot, z, x + 0.8, AMB.deckY, z, x + 0.8, AMB.deckY, z, x + 1.6, trussBot, z);
      }
    }
    // Suspenders (main span only; side spans ride on the truss + piers)
    const suspLines: number[] = [];
    for (let x = AMB.tW + 1.5; x < AMB.tD - 1; x += 1.5) {
      for (const s of [-1, 1]) {
        suspLines.push(x, mainCableY(x), AMB.z + s * AMB.cableZ, x, AMB.deckY + 0.35, AMB.z + s * AMB.deckHalf);
      }
    }
    // Side span piers + approach ramps descending into Detroit and Windsor
    [
      [AMB.tD, AMB.aD],
      [AMB.tW, AMB.aW],
    ].forEach(([tx, ax]) => {
      const mx = (tx + ax) / 2;
      ambConcrete.push(boxAt(0.9, trussBot, 3.2, mx, trussBot / 2, AMB.z));
    });
    const ambRamps: [number, number][] = [
      [AMB.aD, -26],
      [AMB.aW, -152],
    ];
    const deckLamps: number[] = [];
    ambRamps.forEach(([x0, x1]) => {
      ambConcrete.push(beamGeo(v3(x0, AMB.deckY, AMB.z), v3(x1, 0.3, AMB.z), 0.45, AMB.deckHalf * 2 + 0.2));
      const steps = Math.floor(Math.abs(x1 - x0) / 5);
      for (let i = 1; i <= steps; i++) {
        const x = x0 + ((x1 - x0) * i) / (steps + 1);
        const y = AMB.deckY + ((0.3 - AMB.deckY) * i) / (steps + 1);
        ambConcrete.push(boxAt(0.6, y, 2.4, x, y / 2, AMB.z));
        deckLamps.push(x, y + 0.9, AMB.z - AMB.deckHalf, x, y + 0.9, AMB.z + AMB.deckHalf);
      }
    });
    for (let x = AMB.aW + 1.5; x < AMB.aD; x += 3) {
      deckLamps.push(x, AMB.deckY + 0.9, AMB.z - AMB.deckHalf, x, AMB.deckY + 0.9, AMB.z + AMB.deckHalf);
    }

    const ambSteelGeo = mergeGeos(ambSteel);
    const ambConcreteGeo = mergeGeos(ambConcrete);
    scene.add(new THREE.Mesh(ambSteelGeo, ambSteelMat));
    scene.add(new THREE.Mesh(ambConcreteGeo, ambConcreteMat));
    mirrorGroup.add(new THREE.Mesh(ambSteelGeo, steelReflMat));
    const ambWireMat = dnFlat(
      new THREE.LineBasicMaterial({ color: 0x5f7a70, transparent: true, opacity: 0.75 }),
      0x6f8a80,
      0x5a6e66,
      0.75,
      0.8
    );
    scene.add(new THREE.LineSegments(vertsGeo(trussLines), ambWireMat));
    scene.add(new THREE.LineSegments(vertsGeo(suspLines), ambWireMat));

    const necklaceGeo = vertsGeo(necklace);
    const necklaceMat = lightPointsMat(0xfff0c8, 0.5, 0.95);
    scene.add(new THREE.Points(necklaceGeo, necklaceMat));
    const deckLampGeo = vertsGeo(deckLamps);
    const deckLampMat = lightPointsMat(0xffa850, 0.42, 0.9);
    scene.add(new THREE.Points(deckLampGeo, deckLampMat));
    mirrorGroup.add(new THREE.Points(necklaceGeo, lightPointsMat(0xffd9a0, 0.5, 0.35)));
    mirrorGroup.add(new THREE.Points(deckLampGeo, lightPointsMat(0xff9040, 0.42, 0.3)));

    // ── Gordie Howe International Bridge (cable-stayed, opened 2026) ──
    const GH = { z: -80, tD: -89, tW: -165, deckY: 7.5, topY: 30, joinY: 21, legBase: 5.2, deckHalf: 2.3, endW: -200, endD: -58 };
    const ghMat = dnPhong(0x3c4150, 0x9c9890, 0x34405a, 0x1c1c1a, 0.7, { shininess: 20, specular: 0x333333 });
    const ghParts: THREE.BufferGeometry[] = [];
    const ghLegZ = (y: number) => GH.legBase - (GH.legBase - 0.7) * (y / GH.joinY);
    const stayLines: number[] = [];
    const ghLamps: number[] = [];
    [GH.tD, GH.tW].forEach((tx) => {
      ghParts.push(boxAt(3.6, 1.0, GH.legBase * 2 + 3, tx, 0.3, GH.z));
      for (const s of [-1, 1]) {
        ghParts.push(beamGeo(v3(tx, 0.5, GH.z + s * ghLegZ(0.5)), v3(tx, GH.joinY + 0.6, GH.z + s * 0.45), 1.4, 1.1));
      }
      ghParts.push(boxAt(0.9, 0.9, ghLegZ(GH.deckY - 1.2) * 2, tx, GH.deckY - 1.2, GH.z)); // cross beam under deck
      ghParts.push(boxAt(1.5, GH.topY - GH.joinY + 0.5, 1.7, tx, (GH.joinY + GH.topY) / 2, GH.z)); // upper shaft
      const cap = new THREE.ConeGeometry(1.1, 1.4, 4);
      cap.rotateY(Math.PI / 4);
      cap.translate(tx, GH.topY + 0.7, GH.z);
      ghParts.push(cap);
      addBeacon(tx, GH.topY + 1.6, GH.z);

      // Two planes of semi-harp stays anchored in the upper shaft
      const mainDir = tx === GH.tD ? -1 : 1;
      const mainReach = (GH.tD - GH.tW) / 2 - 1.2;
      const backReach = Math.min(Math.abs(tx - (tx === GH.tD ? GH.endD : GH.endW)) - 2, mainReach);
      const N = isMobile ? 8 : 12;
      for (const [dir, reach] of [
        [mainDir, mainReach],
        [-mainDir, backReach],
      ]) {
        for (let i = 0; i < N; i++) {
          const f = i / (N - 1);
          const ay = GH.joinY + 1.5 + f * (GH.topY - GH.joinY - 2);
          const dx = 3 + f * (reach - 3);
          for (const s of [-1, 1]) {
            stayLines.push(tx + dir * 0.4, ay, GH.z + s * 0.5, tx + dir * dx, GH.deckY + 0.4, GH.z + s * GH.deckHalf);
          }
        }
      }
    });
    // Deck, edge girders, piers under the side spans, approach ramps
    ghParts.push(boxAt(GH.endD - GH.endW, 0.7, GH.deckHalf * 2, (GH.endD + GH.endW) / 2, GH.deckY, GH.z));
    for (const s of [-1, 1]) {
      ghParts.push(boxAt(GH.endD - GH.endW, 0.35, 0.25, (GH.endD + GH.endW) / 2, GH.deckY + 0.5, GH.z + s * GH.deckHalf));
    }
    for (const [x0, x1] of [
      [GH.tW - 9, GH.endW],
      [GH.tD + 9, GH.endD],
    ]) {
      const step = Math.sign(x1 - x0) * 9;
      for (let x = x0; Math.abs(x - x0) <= Math.abs(x1 - x0); x += step) {
        ghParts.push(boxAt(1.0, GH.deckY - 0.3, 2.8, x, (GH.deckY - 0.3) / 2, GH.z));
      }
    }
    for (const [x0, x1] of [
      [GH.endW, -226],
      [GH.endD, -38],
    ]) {
      ghParts.push(beamGeo(v3(x0, GH.deckY, GH.z), v3(x1, 0.3, GH.z), 0.6, GH.deckHalf * 2));
    }
    for (let x = GH.endW + 1.5; x < GH.endD; x += 3) {
      ghLamps.push(x, GH.deckY + 0.9, GH.z - GH.deckHalf, x, GH.deckY + 0.9, GH.z + GH.deckHalf);
    }
    const ghGeo = mergeGeos(ghParts);
    scene.add(new THREE.Mesh(ghGeo, ghMat));
    mirrorGroup.add(new THREE.Mesh(ghGeo, steelReflMat));
    const stayGeo = vertsGeo(stayLines);
    const stayMat = dnFlat(
      new THREE.LineBasicMaterial({ color: 0xdfe9ff, transparent: true, opacity: 0.8 }),
      0xdfe9ff,
      0x6c7480,
      0.8,
      0.85
    );
    scene.add(new THREE.LineSegments(stayGeo, stayMat));
    const ghLampGeo = vertsGeo(ghLamps);
    scene.add(new THREE.Points(ghLampGeo, lightPointsMat(0xd8ecff, 0.45, 0.9)));
    mirrorGroup.add(new THREE.Points(ghLampGeo, lightPointsMat(0xb8d4ff, 0.45, 0.3)));

    // ── Windsor, Ontario ──
    const TONES: Record<string, number> = { glass: 0x9cc2dc, warm: 0xe2c6a6, low: 0xc4bdb0, delray: 0x9a8e82 };
    const windsorBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    windsorBoxGeo.translate(0, 0.5, 0);
    const windsorMat = dnPhong(0x2e3446, 0x8a8c90, 0x2a1e10, 0x14181c, 0.6, { shininess: 30, specular: 0x333844 });
    const windsorReflMat = dnFlat(
      new THREE.MeshBasicMaterial({ color: 0x14203a, transparent: true, opacity: 0.22, depthWrite: false }),
      0x14203a,
      0x5d7c8c,
      0.22,
      0.14
    );
    const windsorMesh = new THREE.InstancedMesh(windsorBoxGeo, windsorMat, WINDSOR_DEFS.length);
    const windsorRefl = new THREE.InstancedMesh(windsorBoxGeo, windsorReflMat, WINDSOR_DEFS.length);
    const instM = new THREE.Matrix4();
    const instC = new THREE.Color();
    const windsorWin: number[] = [];
    const windsorWinCol: number[] = [];
    const WIN_WARM = new THREE.Color(0xffbf6a);
    const WIN_COOL = new THREE.Color(0xc4e2ff);
    const WIN_SODIUM = new THREE.Color(0xff9a40);
    WINDSOR_DEFS.forEach((d, i) => {
      instM.makeScale(d.w, d.h, d.d);
      instM.setPosition(d.x, 0, d.z);
      windsorMesh.setMatrixAt(i, instM);
      windsorRefl.setMatrixAt(i, instM);
      windsorMesh.setColorAt(i, instC.setHex(TONES[d.tone]));
      const wc = d.tone === 'glass' ? WIN_COOL : d.tone === 'delray' ? WIN_SODIUM : WIN_WARM;
      const litP = d.tone === 'delray' ? 0.3 : 0.7;
      const cols = Math.max(2, Math.floor(d.w / 0.8));
      const rows = Math.max(1, Math.floor((d.h - 0.6) / 1.2));
      // front face (toward the main river) and east face (toward the channel)
      for (let r = 0; r < rows; r++) {
        const y = 0.8 + r * 1.2;
        for (let c = 0; c < cols; c++) {
          if (Math.random() < litP) {
            windsorWin.push(d.x - d.w * 0.4 + (c * d.w * 0.8) / Math.max(1, cols - 1), y, d.z + d.d / 2 + 0.05);
            windsorWinCol.push(wc.r, wc.g, wc.b);
          }
        }
        for (let c = 0; c < 2; c++) {
          if (d.tone !== 'delray' && Math.random() < litP) {
            windsorWin.push(d.x + d.w / 2 + 0.05, y, d.z - d.d * 0.25 + c * d.d * 0.5);
            windsorWinCol.push(wc.r, wc.g, wc.b);
          }
        }
      }
    });
    windsorMesh.instanceMatrix.needsUpdate = true;
    if (windsorMesh.instanceColor) windsorMesh.instanceColor.needsUpdate = true;
    scene.add(windsorMesh);
    mirrorGroup.add(windsorRefl);

    const windsorWinGeo = new THREE.BufferGeometry();
    windsorWinGeo.setAttribute('position', new THREE.Float32BufferAttribute(windsorWin, 3));
    windsorWinGeo.setAttribute('color', new THREE.Float32BufferAttribute(windsorWinCol, 3));
    const windsorWinMat = dnFlat(
      new THREE.PointsMaterial({ size: 0.36, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }),
      0xffffff,
      0xffffff,
      0.9,
      0.12
    );
    scene.add(new THREE.Points(windsorWinGeo, windsorWinMat));
    const windsorWinReflMat = dnFlat(
      new THREE.PointsMaterial({ size: 0.3, vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false }),
      0xffffff,
      0xffffff,
      0.3,
      0
    );
    mirrorGroup.add(new THREE.Points(windsorWinGeo, windsorWinReflMat));

    // Caesars Windsor crown: gold band + red rooftop glow
    const caesarsCrownMat = dnFlat(
      new THREE.MeshBasicMaterial({ color: 0xffc050, transparent: true, opacity: 0.95 }),
      0xffc050,
      0xb8a27a,
      0.95,
      0.9
    );
    const caesarsCrown = new THREE.Mesh(
      mergeGeos([
        boxAt(CAESARS.w + 0.25, 0.35, CAESARS.d + 0.25, CAESARS.x, CAESARS.h - 0.6, CAESARS.z),
        boxAt(CAESARS.w * 0.6, 0.9, CAESARS.d * 0.6, CAESARS.x, CAESARS.h + 0.45, CAESARS.z),
      ]),
      caesarsCrownMat
    );
    scene.add(caesarsCrown);
    const caesarsGlowMat = dnFlat(
      new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.8, depthWrite: false }),
      0xff3322,
      0xff3322,
      0.8,
      0
    );
    const caesarsGlow = new THREE.Mesh(new THREE.PlaneGeometry(CAESARS.w * 0.7, 0.8), caesarsGlowMat);
    caesarsGlow.position.set(CAESARS.x, CAESARS.h - 1.4, CAESARS.z + CAESARS.d / 2 + 0.06);
    scene.add(caesarsGlow);

    // Windsor riverfront park: lawn strip, lamp posts, lamp glow
    const lawnMat = dnPhong(0x05080a, 0x5f8048, 0x020304, 0x1a2414, 0.3);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(wbx(RIVERFRONT_Z) + 330, 5.5), lawnMat);
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set((wbx(RIVERFRONT_Z) - 330) / 2, 0.0, RIVERFRONT_Z - 3);
    scene.add(lawn);
    const parkPoles: number[] = [];
    const parkLamps: number[] = [];
    for (let x = wbx(RIVERFRONT_Z) - 2; x > -320; x -= 5) {
      parkPoles.push(x, 0, RIVERFRONT_Z - 1.2, x, 2.2, RIVERFRONT_Z - 1.2);
      parkLamps.push(x, 2.3, RIVERFRONT_Z - 1.2);
    }
    scene.add(new THREE.LineSegments(vertsGeo(parkPoles), dnFlat(new THREE.LineBasicMaterial({ color: 0x333340, transparent: true, opacity: 0.8 }), 0x333340, 0x555560, 0.8, 0.8)));
    const parkLampGeo = vertsGeo(parkLamps);
    scene.add(new THREE.Points(parkLampGeo, lightPointsMat(0xffd690, 0.45, 0.95)));
    mirrorGroup.add(new THREE.Points(parkLampGeo, lightPointsMat(0xffc070, 0.45, 0.35)));

    const windsorLight = new THREE.PointLight(0xffa860, 1.2, 70);
    windsorLight.position.set(-150, 14, 8);
    scene.add(windsorLight);

    // Michigan Central Station
    const mcX = -42,
      mcZ = -4,
      mcBaseW = 6,
      mcBaseD = 3,
      mcBaseH = 16;
    const mcBase = new THREE.Mesh(
      new THREE.BoxGeometry(mcBaseW, mcBaseH, mcBaseD),
      dnPhong(0x2a2018, 0x8c7658, 0x443322, 0x2a2016, 0.15)
    );
    mcBase.position.set(mcX, mcBaseH / 2, mcZ);
    scene.add(mcBase);

    const mcTowerH = 6;
    const mcTower = new THREE.Mesh(
      new THREE.BoxGeometry(mcBaseW * 0.6, mcTowerH, mcBaseD * 0.7),
      dnPhong(0x302818, 0x84704f, 0x443322, 0x2a2016, 0.12)
    );
    mcTower.position.set(mcX, mcBaseH + mcTowerH / 2, mcZ);
    scene.add(mcTower);

    const mcCap = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 2.5, 4),
      dnPhong(0x3a3025, 0x6a5a44, 0x554433, 0x2a2016, 0.1)
    );
    mcCap.position.set(mcX, mcBaseH + mcTowerH + 1.25, mcZ);
    mcCap.rotation.y = Math.PI / 4;
    scene.add(mcCap);

    const mcGlowMat = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.08 });
    const mcGlow = new THREE.Mesh(new THREE.PlaneGeometry(mcBaseW * 0.85, mcBaseH * 0.8), mcGlowMat);
    mcGlow.position.set(mcX, mcBaseH / 2, mcZ + mcBaseD / 2 + 0.05);
    scene.add(mcGlow);

    // Facade Window Point Cloud
    const windowPositions: number[] = [];
    const windowColors: number[] = [];
    const windowOnStates: boolean[] = [];

    BUILDING_DEFS.forEach(({ x, z, w, d, h, type }) => {
      const wColor =
        type === 'rencen'
          ? new THREE.Color(0x8ab4ff)
          : type === 'glass'
          ? new THREE.Color(0x99ccee)
          : new THREE.Color(0xffbb44);
      const colCount = Math.max(2, Math.floor(w / 0.8));
      const rowCount = Math.max(2, Math.floor(h / 1.5));
      const sp = {
        x: (w * 0.7) / Math.max(1, colCount - 1),
        y: (h * 0.8) / Math.max(1, rowCount - 1),
      };
      for (let row = 0; row < rowCount; row++) {
        for (let col = 0; col < colCount; col++) {
          if (Math.random() > 0.85) continue;
          windowPositions.push(
            x - w * 0.35 + col * sp.x,
            h * 0.1 + row * sp.y,
            z + (Math.random() < 0.5 ? d / 2 + 0.05 : -d / 2 - 0.05)
          );
          windowColors.push(wColor.r, wColor.g, wColor.b);
          windowOnStates.push(Math.random() > 0.15);
        }
      }
    });

    const winGeo = new THREE.BufferGeometry();
    winGeo.setAttribute('position', new THREE.Float32BufferAttribute(windowPositions, 3));
    winGeo.setAttribute('color', new THREE.Float32BufferAttribute(windowColors, 3));
    const winMat = new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 0.85 });
    scene.add(new THREE.Points(winGeo, winMat));

    const windowColorArray = winGeo.attributes.color.array as Float32Array;
    const windowColorBase = new Float32Array(windowColorArray);

    // Lighting
    const ambient = new THREE.AmbientLight(NIGHT.ambient, 1.35);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xb8d0ff, 0.5);
    dirLight.position.set(-30, 60, 40);
    scene.add(dirLight);

    const streetLight = new THREE.PointLight(0xff6600, 3.0, 65);
    streetLight.position.set(0, 2, 18);
    scene.add(streetLight);

    const renCenLight = new THREE.PointLight(0x0055ff, 3.5, 50);
    renCenLight.position.set(0, 28, 4);
    scene.add(renCenLight);

    const westLight = new THREE.PointLight(0xff7700, 1.8, 60);
    westLight.position.set(-18, 8, 12);
    scene.add(westLight);

    const eastLight = new THREE.PointLight(0xff7700, 0.9, 55);
    eastLight.position.set(22, 6, 12);
    scene.add(eastLight);

    const waterLight = new THREE.PointLight(0x2244bb, 2.0, 100);
    waterLight.position.set(0, -3, 40);
    scene.add(waterLight);

    // Stars
    const starCount = isMobile ? 400 : 1200;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 360;
      starPos[i * 3 + 1] = 22 + Math.random() * 85;
      starPos[i * 3 + 2] = -45 - Math.random() * 65;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.7 });
    scene.add(new THREE.Points(starGeo, starMat));

    // Store reflection base positions
    reflectionGroup.children.forEach((rm: any) => {
      rm.userData.baseX = rm.position.x;
    });

    // Time-of-day State
    let timeOfDay = 0; // 0=midnight, 0.5=noon
    let targetTime: number | null = null;
    let lastTime = performance.now();
    let animId = 0;
    let lastFlickerTime = 0;

    setTargetTimeRef.current = (t: number) => {
      targetTime = t;
    };

    // Landmark focus: camera target eases toward the selected landmark
    const focus = { x: 0, y: 14, z: 0, dist: 58, camX: 0, camY: 2.5 };
    const cam = { x: 0, y: 10, z: 65, lx: 0, lz: 0, h: 2.5 };
    const focusLight = new THREE.PointLight(0xffb067, 0, 36);
    focusLight.position.set(focus.x, focus.y + 14, focus.z + 6);
    scene.add(focusLight);
    let focusPulse = 0;
    focusLandmarkRef.current = (id: string) => {
      const f = LANDMARK_FOCUS[id] ?? LANDMARK_FOCUS.rencen;
      focus.x = f.x;
      focus.y = f.y;
      focus.z = f.z;
      focus.dist = f.dist;
      focus.camX = f.camX ?? f.x;
      focus.camY = f.camY ?? 2.5;
      focusPulse = 1;
    };

    function animateWater(geo: any, baseY: Float32Array, offX: number, offZ: number, t0: number) {
      const arr = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < baseY.length; i++) {
        const ix = arr[i * 3] + offX;
        const iz = arr[i * 3 + 2] + offZ;
        arr[i * 3 + 1] =
          baseY[i] +
          Math.sin(t0 * 0.6 + ix * 0.06 + iz * 0.1) * 0.45 +
          Math.sin(t0 * 0.9 + ix * 0.14 - iz * 0.08) * 0.25 +
          Math.sin(t0 * 1.8 + ix * 0.22 + iz * 0.18) * 0.08 +
          Math.sin(t0 * 0.25 + ix * 0.03 + iz * 0.04) * 0.28;
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
    }

    function animate(time: number) {
      animId = requestAnimationFrame(animate);
      const dt = Math.min((time - lastTime) * 0.001, 0.1);
      lastTime = time;
      const t0 = time * 0.001;

      // Advance time of day
      if (targetTime !== null) {
        let diff = targetTime - timeOfDay;
        if (diff > 0.5) diff -= 1;
        if (diff < -0.5) diff += 1;
        const speed = 0.25;
        const step = Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
        timeOfDay = (((timeOfDay + step) % 1) + 1) % 1;
        if (Math.abs(diff) < 0.005) {
          timeOfDay = targetTime;
          targetTime = null;
        }
      } else {
        timeOfDay = (timeOfDay + dt / CYCLE_SECONDS) % 1;
      }

      const day = dayFactor(timeOfDay);
      const glow = glowFactor(timeOfDay);
      const night = 1 - day;

      // Sky gradient
      let skyTopHex = lerpHex(NIGHT.skyTop, DAY.skyTop, day);
      let skyHorizonHex = lerpHex(NIGHT.skyHorizon, DAY.skyHorizon, day);
      if (glow > 0) {
        skyTopHex = tintHex(skyTopHex, GLOW_TINT.skyTop, glow * 0.5);
        skyHorizonHex = tintHex(skyHorizonHex, GLOW_TINT.skyHorizon, glow * 0.85);
      }
      const tr = ((skyTopHex >> 16) & 0xff) / 255;
      const tg = ((skyTopHex >> 8) & 0xff) / 255;
      const tb = (skyTopHex & 0xff) / 255;
      const hr = ((skyHorizonHex >> 16) & 0xff) / 255;
      const hg = ((skyHorizonHex >> 8) & 0xff) / 255;
      const hb = (skyHorizonHex & 0xff) / 255;
      skyColorAttr[0] = tr;
      skyColorAttr[1] = tg;
      skyColorAttr[2] = tb;
      skyColorAttr[3] = tr;
      skyColorAttr[4] = tg;
      skyColorAttr[5] = tb;
      skyColorAttr[6] = hr;
      skyColorAttr[7] = hg;
      skyColorAttr[8] = hb;
      skyColorAttr[9] = hr;
      skyColorAttr[10] = hg;
      skyColorAttr[11] = hb;
      skyGeo.attributes.color.needsUpdate = true;

      // Fog & Clear
      let fogHex = lerpHex(NIGHT.fog, DAY.fog, day);
      let clearHex = lerpHex(NIGHT.clear, DAY.clear, day);
      if (glow > 0) {
        fogHex = tintHex(fogHex, GLOW_TINT.fog, glow * 0.4);
        clearHex = tintHex(clearHex, GLOW_TINT.clear, glow * 0.3);
      }
      scene.fog.color.setHex(fogHex);
      renderer.setClearColor(clearHex, 1);

      // Sun
      const sunProgress = Math.max(0, Math.min(1, (timeOfDay - 0.18) / 0.64));
      const sunArc = Math.sin(sunProgress * Math.PI);
      const sunX = 55 * Math.cos(sunProgress * Math.PI);
      const sunYpos = sunArc * 55 + 5;
      sunMesh.position.set(sunX, sunYpos, -85);
      sunGlow.position.copy(sunMesh.position);
      sunCorona.position.copy(sunMesh.position);

      const sunHeight = Math.max(0, (sunYpos - 5) / 55);
      sunMat.color.copy(SUN_LOW).lerp(SUN_HIGH, sunHeight);
      const sunOp = Math.max(0, Math.min(1, (day - 0.05) / 0.25));
      sunMat.opacity = sunOp * 0.95;
      sunGlowMat.opacity = sunOp * 0.2;
      sunCoronaMat.opacity = sunOp * 0.08;

      // Moon
      const moonOp = Math.max(0, Math.min(1, (0.4 - day) / 0.3));
      moonMat.opacity = moonOp * 0.95;
      moonGlowMat.opacity = moonOp * (0.06 + 0.09 * Math.sin(t0 * 0.3));
      moonCoronaMat.opacity = moonOp * 0.06;

      // Stars
      starMat.opacity = Math.max(0, Math.min(0.75, ((0.35 - day) / 0.3) * 0.75));

      // Ambient
      ambient.color.setHex(lerpHex(NIGHT.ambient, DAY.ambient, day));
      ambient.intensity = 1.35 + day * 7.5;

      // Antenna Beacons
      antennaBeaconMats.forEach((mat: any, i: number) => {
        mat.opacity = night * (0.3 + 0.6 * Math.sin(t0 * 2.2 + i * 1.5));
      });

      // Directional light
      if (day > 0.1) {
        dirLight.color.setHex(lerpHex(0xff9955, 0xffeedd, Math.min(1, (day - 0.1) / 0.4)));
        dirLight.intensity = 0.3 + day * 5.5;
        dirLight.position.set(sunX * 0.5, Math.max(10, sunYpos), 40);
      } else {
        dirLight.color.setHex(0xb8d0ff);
        dirLight.intensity = 0.5 * night;
        dirLight.position.set(-30, 60, 40);
      }

      streetLight.intensity = 0.3 + night * 2.7 + 0.2 * Math.sin(t0 * 7.3) * night;
      westLight.intensity = 0.2 + night * 1.6;
      eastLight.intensity = 0.1 + night * 0.8;
      crownMat.opacity = 0.5 + night * 0.5 + 0.18 * Math.sin(t0 * 0.7) * night;
      renCenLight.intensity = 1.2 + night * 2.5 + 0.6 * Math.sin(t0 * 0.5) * night;
      mcGlowMat.opacity = night * 0.08;

      // Buildings
      for (let i = 0; i < buildingMats.length; i++) {
        buildingMats[i].emissiveIntensity = buildingBaseEmissive[i] * (0.55 + night * 0.45);
        const bt = buildingTypes[i];
        buildingMats[i].color.setHex(lerpHex(NIGHT_BUILDING[bt].color, DAY_BUILDING[bt].color, day));
        buildingMats[i].emissive.setHex(lerpHex(NIGHT_BUILDING[bt].emissive, DAY_BUILDING[bt].emissive, day));
      }

      for (let i = 0; i < outlineMats.length; i++) {
        outlineMats[i].opacity = 0.35 - day * 0.2;
      }
      for (let i = 0; i < rimGlowMats.length; i++) {
        rimGlowMats[i].opacity = glow * 0.35;
      }

      winMat.opacity = 0.2 + night * 0.65;
      waterMat.color.setHex(lerpHex(NIGHT.water, DAY.water, day));
      promenadeMat.color.setHex(lerpHex(0x2a2020, 0x887766, day));
      promenadeMat.emissive.setHex(lerpHex(0x100c08, 0x443322, day));
      hazeMat.color.setHex(lerpHex(NIGHT.haze, DAY.haze, day));
      hazeMat.opacity = 0.02 + night * 0.03 + glow * 0.04;
      wlMat.color.setHex(lerpHex(NIGHT.waterline, DAY.waterline, day));
      wlMat.opacity = 0.25 + night * 0.5 + 0.12 * Math.sin(t0 * 0.5);
      waterLight.intensity = 0.5 + night * 1.5;

      clouds.forEach((c) => {
        c.mat.opacity = c.baseOp + day * 0.06;
        c.mat.color.setHex(lerpHex(0x888888, 0xdddddd, day));
        c.mesh.position.x = c.startX + Math.sin(t0 * 0.05 * c.speed) * 20 + t0 * c.speed * 0.5;
        if (c.mesh.position.x > 150) c.mesh.position.x -= 300;
      });

      gordieBeacons.forEach((mat) => {
        mat.opacity = 0.15 + night * (0.45 + 0.35 * Math.sin(t0 * 2.5));
      });

      // Bridges, banks + Windsor day/night
      for (let i = 0; i < dnPhongMats.length; i++) {
        const m = dnPhongMats[i];
        m.mat.color.setHex(lerpHex(m.nc, m.dc, day));
        m.mat.emissive.setHex(lerpHex(m.ne, m.de, day));
      }
      for (let i = 0; i < dnFlatMats.length; i++) {
        const m = dnFlatMats[i];
        m.mat.color.setHex(lerpHex(m.nc, m.dc, day));
        m.mat.opacity = m.nOp + (m.dOp - m.nOp) * day;
      }
      windsorLight.intensity = 0.2 + night * 1.2;

      // Camera sway
      const ease = 1 - Math.exp(-dt * 2.2);
      cam.x += (focus.camX - cam.x) * ease;
      cam.y += (focus.y - cam.y) * ease;
      cam.z += (focus.dist - cam.z) * ease;
      cam.lx += (focus.x - cam.lx) * ease;
      cam.lz += (focus.z - cam.lz) * ease;
      cam.h += (focus.camY - cam.h) * ease;
      camera.position.x = cam.x + Math.sin(t0 * 0.08) * 2.5;
      camera.position.y = cam.h + Math.sin(t0 * 0.06) * 0.3;
      camera.position.z = cam.z;
      camera.lookAt(cam.lx, cam.y - 2, cam.lz);

      focusPulse = Math.max(0, focusPulse - dt * 0.6);
      focusLight.position.x += (focus.x - focusLight.position.x) * ease;
      focusLight.position.y = focus.y + 14;
      focusLight.position.z = cam.lz + 6;
      focusLight.intensity = 2.2 + focusPulse * 5 + 0.4 * Math.sin(t0 * 2);

      // Water wave dynamics (world-space so the river and channel meet seamlessly)
      animateWater(waterGeo, waterBaseY, waterMesh.position.x, waterMesh.position.z, t0);
      animateWater(channelGeo, channelBaseY, 0, 0, t0);

      // Inverted Reflection Distortion
      for (let i = 0; i < reflectionGroup.children.length; i++) {
        const rm: any = reflectionGroup.children[i];
        rm.position.x = rm.userData.baseX + Math.sin(t0 * 0.8 + i * 0.5) * 0.4;
        rm.scale.x = 1.0 + Math.sin(t0 * 0.6 + i * 0.7) * 0.02;
      }

      // Window Flicker
      if (time - lastFlickerTime > 2000) {
        lastFlickerTime = time;
        const flickerCount = 3 + Math.floor(Math.random() * 5);
        for (let f = 0; f < flickerCount; f++) {
          const idx = Math.floor(Math.random() * windowOnStates.length);
          windowOnStates[idx] = !windowOnStates[idx];
          const base = idx * 3;
          if (windowOnStates[idx]) {
            windowColorArray[base] = windowColorBase[base];
            windowColorArray[base + 1] = windowColorBase[base + 1];
            windowColorArray[base + 2] = windowColorBase[base + 2];
          } else {
            windowColorArray[base] = 0.02;
            windowColorArray[base + 1] = 0.02;
            windowColorArray[base + 2] = 0.03;
          }
        }
        winGeo.attributes.color.needsUpdate = true;
      }

      // Boats
      boats.forEach((b: any) => {
        b.position.x += b.userData.speed * 0.02;
        if (b.position.x > 60) b.position.x = -60;
        b.position.y = -1.2 + Math.sin(t0 * 2 + b.userData.startX) * 0.1;
        b.rotation.z = Math.sin(t0 * 1.5 + b.userData.startX) * 0.05;
      });

      // Current particles
      const cpArr = currentGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < currentParticleCount; i++) {
        cpArr[i * 3] += currentSpeeds[i];
        if (cpArr[i * 3] > 120) {
          cpArr[i * 3] = -120;
          cpArr[i * 3 + 2] = 30 + Math.random() * 20;
        }
        const px = cpArr[i * 3];
        const pz = cpArr[i * 3 + 2];
        cpArr[i * 3 + 1] = Math.sin(t0 * 0.6 + px * 0.06 + pz * 0.1) * 0.2;
      }
      currentGeo.attributes.position.needsUpdate = true;

      // Foam lines
      foamLines.forEach((f: any) => {
        const posA = f.geo.attributes.position.array as Float32Array;
        posA[0] += f.speed;
        posA[3] += f.speed;
        if (posA[0] > 120) {
          const newX = -120;
          posA[0] = newX;
          posA[3] = newX + f.lineLen;
          posA[2] = 32 + Math.random() * 16;
          posA[5] = posA[2] + (Math.random() - 0.5) * 1.5;
        }
        const midX = (posA[0] + posA[3]) / 2;
        const midZ = (posA[2] + posA[5]) / 2;
        const bob = Math.sin(t0 * 0.6 + midX * 0.06 + midZ * 0.1) * 0.15;
        posA[1] = f.baseY + bob;
        posA[4] = f.baseY + bob;
        f.geo.attributes.position.needsUpdate = true;
      });

      renderer.render(scene, camera);
    }
    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      const disposed = new Set<any>();
      scene.traverse((obj: any) => {
        const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
        [obj.geometry, ...mats, ...mats.map((m: any) => m.map)].forEach((res) => {
          if (res && !disposed.has(res)) {
            disposed.add(res);
            res.dispose();
          }
        });
        if (obj.isInstancedMesh) obj.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const handleSelectPreset = (preset: 'midnight' | 'sunrise' | 'noon' | 'sunset', timeVal: number) => {
    sound.playBeep(520, 0.04);
    setActivePreset(preset);
    setTargetTimeRef.current?.(timeVal);
  };

  const handleToggleDayNight = () => {
    sound.playPowerUp();
    if (activePreset === 'noon' || activePreset === 'sunset') {
      handleSelectPreset('midnight', 0.0);
    } else {
      handleSelectPreset('noon', 0.5);
    }
  };

  return (
    <div className={styles.skylineSection} aria-label="Authentic 3D Detroit Skyline Scene">
      {/* Header Bar */}
      <div className={styles.skylineHeader}>
        <div className={styles.skylineTitleGroup}>
          <div className={styles.skylineBadge}>
            <span className={styles.liveIndicator} />
            <span>BUILT IN DETROIT // MOTOR CITY METROPOLIS</span>
          </div>
          <h2 className={styles.skylineHeading}>The Motor City Skyline & International Riverfront</h2>
          <p className={styles.skylineSubheading}>DETROIT, MI • 42.3314° N, 83.0458° W // {detroitTime}</p>
        </div>

        {/* Time of Day Mood Controls */}
        <div className={styles.skylineControls}>
          <button
            type="button"
            className={`${styles.presetBtn} ${activePreset === 'midnight' ? styles.active : ''}`}
            onClick={() => handleSelectPreset('midnight', 0.0)}
          >
            MIDNIGHT
          </button>
          <button
            type="button"
            className={`${styles.presetBtn} ${activePreset === 'sunrise' ? styles.active : ''}`}
            onClick={() => handleSelectPreset('sunrise', 0.22)}
          >
            SUNRISE
          </button>
          <button
            type="button"
            className={`${styles.presetBtn} ${activePreset === 'noon' ? styles.active : ''}`}
            onClick={() => handleSelectPreset('noon', 0.5)}
          >
            NOON
          </button>
          <button
            type="button"
            className={`${styles.presetBtn} ${activePreset === 'sunset' ? styles.active : ''}`}
            onClick={() => handleSelectPreset('sunset', 0.78)}
          >
            SUNSET
          </button>

          <button
            type="button"
            className={styles.cycleToggleBtn}
            onClick={handleToggleDayNight}
            title="Toggle Day / Night"
          >
            {activePreset === 'noon' || activePreset === 'sunset' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.cycleIcon}>
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.cycleIcon}>
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
            <span>CYCLE</span>
          </button>
        </div>
      </div>

      {/* 3D WebGL Canvas Viewport */}
      <div className={styles.canvasWrapper}>
        <div ref={containerRef} className={styles.canvasContainer} />

        {/* Floating Active Landmark Intel */}
        <div className={styles.landmarkIntel}>
          <div className={styles.landmarkTag}>{selectedLandmark.tag}</div>
          <h3 className={styles.landmarkTitle}>{selectedLandmark.name}</h3>
          <p className={styles.landmarkDesc}>{selectedLandmark.desc}</p>
        </div>

        {/* Landmark Selector Pills on Top-Right */}
        <div className={styles.landmarksBar}>
          {LANDMARKS.map((lm) => (
            <button
              key={lm.id}
              type="button"
              className={`${styles.landmarkPill} ${selectedLandmark.id === lm.id ? styles.active : ''}`}
              aria-pressed={selectedLandmark.id === lm.id}
              onClick={() => {
                sound.playJump();
                setSelectedLandmark(lm);
                focusLandmarkRef.current?.(lm.id);
              }}
            >
              {lm.name}
            </button>
          ))}
        </div>
      </div>

      {/* Footer Info */}
      <div className={styles.skylineFooter}>
        <span className={styles.quoteText}>
          &ldquo;Detroit forged my discipline, my grit, and my respect for timeless engineering.&rdquo;
        </span>
        <span>THREE.JS REALTIME SHADERS &bull; AMBASSADOR &amp; GORDIE HOWE BRIDGES &bull; RENAISSANCE CENTER &bull; DETROIT RIVER &bull; WINDSOR</span>
      </div>
    </div>
  );
};

export default DetroitSkylineScene;
