import * as THREE from 'three';
import { GlobeContext, GlobeModule } from '../globeTypes';

// ============================================================================
// CELESTIAL ANGEL LUNA (In Loving Memory of Luna)
// A small articulated rig: fawn body with a cream chest, greying muzzle, big
// flyaway ears, halo, and two three-segment feathered wings. The wing beat has
// a fast downstroke, a slower folding upstroke, feathers that lag the bones,
// a body bob synced to the beat, and gliding pauses between flapping bouts.
// Rig axes: +Z forward (nose), +Y up, +X = Luna's left side.
// ============================================================================

const isLight = () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light';

const COLORS = {
  fawn: 0xd49a58,
  fawnDark: 0xb07a3e,
  cream: 0xf6e8cc,
  muzzleGrey: 0xcfc8bd,
  greyPatch: 0xb9b2a8,
  earInner: 0xe9b89a,
  nose: 0x2a201b,
  eye: 0x17110e,
  feather: 0xfffcf4,
  featherTip: 0xf1e2bf,
  covert: 0xfbf1dc,
  halo: 0xffd75e,
  haloGlow: 0xffb347,
};

// Beat timing
const BEAT_MS = 560; // one full wing beat
const DOWN_FRACTION = 0.4; // downstroke is faster than upstroke

function stroke(phase: number): number {
  // +1 = wings up, -1 = wings down
  const p = phase - Math.floor(phase);
  if (p < DOWN_FRACTION) return Math.cos((Math.PI * p) / DOWN_FRACTION);
  return -Math.cos((Math.PI * (p - DOWN_FRACTION)) / (1 - DOWN_FRACTION));
}

function strokeVel(phase: number): number {
  return (stroke(phase + 0.01) - stroke(phase - 0.01)) / 0.02;
}

function upstrokeFold(phase: number): number {
  const p = phase - Math.floor(phase);
  if (p < DOWN_FRACTION) return 0;
  return Math.sin((Math.PI * (p - DOWN_FRACTION)) / (1 - DOWN_FRACTION));
}

function makeNameTagTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const c = canvas.getContext('2d');
  if (c) {
    c.fillStyle = 'rgba(15, 23, 42, 0.85)';
    c.beginPath();
    c.roundRect(8, 10, 240, 76, 38);
    c.fill();
    c.strokeStyle = '#f59e0b';
    c.lineWidth = 4;
    c.stroke();
    c.fillStyle = '#fff7e0';
    c.font = '800 40px "Cinzel", "Montserrat", system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = '#f59e0b';
    c.shadowBlur = 10;
    c.fillText('★ LUNA ★', 128, 50);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export function createLuna(ctx: GlobeContext): GlobeModule {
  const { scene, universeGroup, isMobile, reducedMotion } = ctx;
  const target = universeGroup || scene;

  const geometries: any[] = [];
  const materials: any[] = [];
  const g = <T>(geo: T): T => {
    geometries.push(geo);
    return geo;
  };
  const lambert = (color: number, emissiveK = 0.45, extra: Record<string, unknown> = {}) => {
    const c = new THREE.Color(color);
    const mat = new THREE.MeshLambertMaterial({
      color: c,
      emissive: c.clone().multiplyScalar(emissiveK),
      ...extra,
    });
    materials.push(mat);
    return mat;
  };

  const fawnMat = lambert(COLORS.fawn);
  const fawnDarkMat = lambert(COLORS.fawnDark);
  const creamMat = lambert(COLORS.cream, 0.5);
  const muzzleMat = lambert(COLORS.muzzleGrey, 0.5);
  const greyMat = lambert(COLORS.greyPatch, 0.5);
  const earInnerMat = lambert(COLORS.earInner, 0.5, { side: THREE.DoubleSide });
  const earOuterMat = lambert(COLORS.fawn, 0.45, { side: THREE.DoubleSide });
  const noseMat = lambert(COLORS.nose, 0.1);
  const eyeMat = lambert(COLORS.eye, 0.05);
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  materials.push(glintMat);
  const featherMat = lambert(COLORS.feather, 0.55, { side: THREE.DoubleSide });
  const featherTipMat = lambert(COLORS.featherTip, 0.55, { side: THREE.DoubleSide });
  const covertMat = lambert(COLORS.covert, 0.55, { side: THREE.DoubleSide });
  const haloMat = new THREE.MeshBasicMaterial({ color: COLORS.halo });
  const haloGlowMat = new THREE.MeshBasicMaterial({
    color: COLORS.haloGlow,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  materials.push(haloMat, haloGlowMat);

  const sphereGeo = g(new THREE.SphereGeometry(1, 14, 10));
  const lowSphereGeo = g(new THREE.SphereGeometry(1, 8, 6));

  function blob(mat: any, sx: number, sy: number, sz: number, x: number, y: number, z: number, parent: any, low = false) {
    const mesh = new THREE.Mesh(low ? lowSphereGeo : sphereGeo, mat);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  // Root (path + orientation) -> rig (beat bob / pitch) -> parts
  const lunaRoot = new THREE.Group();
  lunaRoot.scale.setScalar(1.3);
  const rig = new THREE.Group();
  lunaRoot.add(rig);

  // --- Body ---
  blob(fawnMat, 0.046, 0.042, 0.082, 0, 0, 0, rig);
  blob(fawnDarkMat, 0.036, 0.018, 0.06, 0, 0.03, -0.005, rig, true); // darker saddle
  blob(creamMat, 0.034, 0.03, 0.05, 0, -0.016, 0.042, rig); // cream chest
  blob(creamMat, 0.03, 0.02, 0.05, 0, -0.026, -0.005, rig, true); // cream belly

  // --- Legs (tucked for flight) ---
  const legGeo = g(new THREE.CylinderGeometry(0.009, 0.008, 0.05, 6));
  legGeo.translate(0, -0.025, 0);
  const legs: any[] = [];
  const legDefs: [number, number, number, number][] = [
    [0.022, -0.02, 0.05, -1.1], // front legs reach forward
    [-0.022, -0.02, 0.05, -1.1],
    [0.024, -0.018, -0.052, 1.2], // hind legs trail back
    [-0.024, -0.018, -0.052, 1.2],
  ];
  legDefs.forEach(([x, y, z, rx]) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.x = rx;
    const leg = new THREE.Mesh(legGeo, fawnMat);
    pivot.add(leg);
    blob(creamMat, 0.011, 0.009, 0.013, 0, -0.052, 0, pivot, true); // cream paws
    rig.add(pivot);
    legs.push(pivot);
  });

  // --- Tail (two segments) ---
  const tailBase = new THREE.Group();
  tailBase.position.set(0, 0.018, -0.078);
  tailBase.rotation.x = -1.35;
  const tailGeo = g(new THREE.CylinderGeometry(0.006, 0.009, 0.045, 6));
  tailGeo.translate(0, 0.0225, 0);
  tailBase.add(new THREE.Mesh(tailGeo, fawnMat));
  const tailTip = new THREE.Group();
  tailTip.position.y = 0.043;
  const tailTipGeo = g(new THREE.CylinderGeometry(0.003, 0.006, 0.04, 6));
  tailTipGeo.translate(0, 0.02, 0);
  tailTip.add(new THREE.Mesh(tailTipGeo, fawnDarkMat));
  tailBase.add(tailTip);
  rig.add(tailBase);

  // --- Head ---
  const head = new THREE.Group();
  head.position.set(0, 0.04, 0.09);
  rig.add(head);
  blob(fawnMat, 0.04, 0.037, 0.04, 0, 0, 0, head);
  blob(creamMat, 0.026, 0.02, 0.018, 0, -0.018, 0.02, head, true); // cream throat
  // Muzzle (greying)
  const muzzleGeo = g(new THREE.CylinderGeometry(0.017, 0.022, 0.042, 10));
  muzzleGeo.rotateX(Math.PI / 2);
  const muzzle = new THREE.Mesh(muzzleGeo, muzzleMat);
  muzzle.position.set(0, -0.009, 0.045);
  head.add(muzzle);
  blob(greyMat, 0.019, 0.01, 0.016, 0, -0.019, 0.048, head, true); // grey chin
  blob(greyMat, 0.014, 0.008, 0.012, 0, 0.004, 0.05, head, true); // grey bridge
  blob(noseMat, 0.009, 0.007, 0.007, 0, -0.003, 0.067, head, true);
  // Eyes with grey brows (senior dog)
  [1, -1].forEach((s) => {
    blob(eyeMat, 0.0065, 0.0065, 0.005, s * 0.018, 0.01, 0.033, head, true);
    blob(glintMat, 0.0018, 0.0018, 0.0018, s * 0.02, 0.0125, 0.037, head, true);
    blob(greyMat, 0.008, 0.003, 0.005, s * 0.017, 0.019, 0.031, head, true);
  });

  // --- Big flyaway ears (two segments each) ---
  function earShape(len: number, wid: number) {
    const s = new THREE.Shape();
    s.moveTo(-wid * 0.5, 0);
    s.quadraticCurveTo(-wid * 0.7, len * 0.55, -wid * 0.1, len);
    s.quadraticCurveTo(wid * 0.35, len * 0.9, wid * 0.5, 0);
    s.closePath();
    return g(new THREE.ShapeGeometry(s, 6));
  }
  const earBaseGeo = earShape(0.05, 0.05);
  const earBaseInnerGeo = earShape(0.04, 0.032);
  const earTipGeo = earShape(0.042, 0.04);

  type Ear = { base: any; tip: any; side: number };
  const ears: Ear[] = [];
  [1, -1].forEach((side) => {
    const base = new THREE.Group();
    base.position.set(side * 0.026, 0.024, -0.008);
    const outer = new THREE.Mesh(earBaseGeo, earOuterMat);
    base.add(outer);
    const inner = new THREE.Mesh(earBaseInnerGeo, earInnerMat);
    inner.position.set(0, 0.004, 0.0015);
    base.add(inner);
    const tip = new THREE.Group();
    tip.position.y = 0.046;
    tip.add(new THREE.Mesh(earTipGeo, earOuterMat));
    base.add(tip);
    head.add(base);
    ears.push({ base, tip, side });
  });

  // --- Halo ---
  const haloGroup = new THREE.Group();
  haloGroup.position.set(0, 0.07, -0.004);
  haloGroup.rotation.x = Math.PI / 2 - 0.25;
  const haloGeo = g(new THREE.TorusGeometry(0.036, 0.0055, 8, 32));
  haloGroup.add(new THREE.Mesh(haloGeo, haloMat));
  const haloGlowGeo = g(new THREE.RingGeometry(0.03, 0.056, 32));
  haloGroup.add(new THREE.Mesh(haloGlowGeo, haloGlowMat));
  head.add(haloGroup);

  // --- Wings: shoulder -> elbow -> wrist, feathers on each segment ---
  // Unit feather lying in the wing plane, quill at origin, tip toward -Z.
  const featherShape = new THREE.Shape();
  featherShape.moveTo(0, 0);
  featherShape.quadraticCurveTo(0.55, -0.3, 0.32, -0.9);
  featherShape.quadraticCurveTo(0.12, -1.02, 0, -1.0);
  featherShape.quadraticCurveTo(-0.3, -0.9, -0.42, -0.3);
  featherShape.closePath();
  const featherGeo = g(new THREE.ShapeGeometry(featherShape, 4));
  featherGeo.rotateX(Math.PI / 2); // shape -y -> -z (trailing), x stays span
  const boneGeo = g(new THREE.CylinderGeometry(0.0065, 0.0085, 1, 6));
  boneGeo.rotateZ(-Math.PI / 2);
  boneGeo.translate(0.5, 0, 0);
  const covertGeo = g(new THREE.CircleGeometry(1, 12, Math.PI, Math.PI));
  covertGeo.rotateX(Math.PI / 2);

  type Wing = { shoulder: any; elbow: any; wrist: any; secondaries: any; tertials: any; primaries: any };

  function addFeathers(parent: any, defs: [number, number, number, number, boolean][]) {
    // [x along bone, length, width, splay yaw, tip-colored]
    defs.forEach(([x, len, wid, yaw, tipCol]) => {
      const f = new THREE.Mesh(featherGeo, tipCol ? featherTipMat : featherMat);
      f.position.set(x, -0.001, 0.004);
      f.scale.set(wid, 1, len);
      f.rotation.y = yaw;
      parent.add(f);
    });
  }

  function makeWing(): { outer: any; wing: Wing } {
    const outer = new THREE.Group();
    outer.position.set(0.026, 0.03, 0.018);
    const shoulder = new THREE.Group();
    outer.add(shoulder);

    // Inner arm (tertials + coverts)
    const bone1 = new THREE.Mesh(boneGeo, covertMat);
    bone1.scale.set(0.07, 1, 1);
    shoulder.add(bone1);
    const cov1 = new THREE.Mesh(covertGeo, covertMat);
    cov1.scale.set(0.038, 1, 0.03);
    cov1.position.set(0.036, 0.001, 0.004);
    shoulder.add(cov1);
    const tertials = new THREE.Group();
    shoulder.add(tertials);
    addFeathers(tertials, [
      [0.012, 0.062, 0.03, -0.12, false],
      [0.034, 0.07, 0.03, -0.04, false],
      [0.056, 0.074, 0.03, 0.02, false],
    ]);

    // Forearm (secondaries)
    const elbow = new THREE.Group();
    elbow.position.x = 0.07;
    shoulder.add(elbow);
    const bone2 = new THREE.Mesh(boneGeo, covertMat);
    bone2.scale.set(0.068, 0.9, 0.9);
    elbow.add(bone2);
    const cov2 = new THREE.Mesh(covertGeo, covertMat);
    cov2.scale.set(0.036, 1, 0.026);
    cov2.position.set(0.034, 0.001, 0.004);
    elbow.add(cov2);
    const secondaries = new THREE.Group();
    elbow.add(secondaries);
    addFeathers(secondaries, [
      [0.008, 0.078, 0.03, 0.04, false],
      [0.028, 0.082, 0.03, 0.1, false],
      [0.048, 0.086, 0.03, 0.16, false],
      [0.064, 0.088, 0.028, 0.24, true],
    ]);

    // Hand (primaries fan toward the tip)
    const wrist = new THREE.Group();
    wrist.position.x = 0.068;
    elbow.add(wrist);
    const bone3 = new THREE.Mesh(boneGeo, covertMat);
    bone3.scale.set(0.05, 0.75, 0.75);
    wrist.add(bone3);
    const primaries = new THREE.Group();
    wrist.add(primaries);
    addFeathers(primaries, [
      [0.006, 0.095, 0.028, 0.34, true],
      [0.018, 0.105, 0.027, 0.5, true],
      [0.03, 0.112, 0.026, 0.68, true],
      [0.041, 0.112, 0.025, 0.88, true],
      [0.05, 0.104, 0.024, 1.1, true],
      [0.056, 0.09, 0.022, 1.32, true],
    ]);

    return { outer, wing: { shoulder, elbow, wrist, secondaries, tertials, primaries } };
  }

  const left = makeWing();
  rig.add(left.outer);
  const right = makeWing();
  right.outer.position.x = -right.outer.position.x;
  right.outer.scale.x = -1; // mirror; animation happens on the inner groups
  rig.add(right.outer);
  const wings = [left.wing, right.wing];

  // --- Name tag (billboard sprite above Luna) ---
  const nameTagTex = makeNameTagTexture();
  const nameTagMat = new THREE.SpriteMaterial({ map: nameTagTex, transparent: true, depthWrite: false });
  materials.push(nameTagMat);
  const nameTag = new THREE.Sprite(nameTagMat);
  nameTag.position.set(0, 0.2, 0.02);
  nameTag.scale.set(0.12, 0.045, 1);
  lunaRoot.add(nameTag);

  // --- Stardust trail (ring buffer, no per-frame allocation) ---
  const trailCount = isMobile ? 18 : 34;
  const trailPos = new Float32Array(trailCount * 3);
  const trailColors = new Float32Array(trailCount * 3);
  const history = new Float32Array(trailCount * 3);
  let historyHead = 0;
  let historyFilled = 0;
  const trailGeo = g(new THREE.BufferGeometry());
  const trailPosAttr = new THREE.BufferAttribute(trailPos, 3);
  trailPosAttr.setUsage(THREE.DynamicDrawUsage);
  trailGeo.setAttribute('position', trailPosAttr);
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  for (let i = 0; i < trailCount; i++) {
    const fade = 1 - i / trailCount;
    trailColors[i * 3] = 1.0;
    trailColors[i * 3 + 1] = 0.85 * fade + 0.15;
    trailColors[i * 3 + 2] = 0.35 * fade;
  }
  const trailMat = new THREE.PointsMaterial({
    size: 0.022,
    transparent: true,
    opacity: 0.75,
    vertexColors: true,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  materials.push(trailMat);
  const trailPoints = new THREE.Points(trailGeo, trailMat);
  trailPoints.frustumCulled = false;
  target.add(trailPoints);
  target.add(lunaRoot);

  // --- Pose helpers ---
  const GLIDE = { shoulder: 0.32, elbow: -0.06, wrist: 0.1, fold: 0.1 };

  function poseWings(phase: number, glide: number, time: number) {
    const s0 = stroke(phase);
    const s1 = stroke(phase - 0.08);
    const s2 = stroke(phase - 0.16);
    const fold = upstrokeFold(phase);
    const v1 = strokeVel(phase - 0.1);
    const v2 = strokeVel(phase - 0.2);
    const flap = 1 - glide;
    const wobble = Math.sin(time * 0.009) * 0.04 * glide;

    const shoulderZ = (0.12 + 0.82 * s0) * flap + GLIDE.shoulder * glide;
    const elbowZ = (0.34 * s1 - 0.04) * flap + GLIDE.elbow * glide;
    const wristZ = (0.42 * s2) * flap + GLIDE.wrist * glide + wobble;
    const foldAmt = fold * flap + GLIDE.fold * glide;
    // Feathers are pushed up on the downstroke (negative velocity), trail behind the bones
    const secPitch = -0.035 * v1 * flap + wobble * 0.6;
    const priPitch = -0.05 * v2 * flap + wobble;

    for (let i = 0; i < wings.length; i++) {
      const w = wings[i];
      w.shoulder.rotation.set(0, 0.12 + foldAmt * 0.2, shoulderZ);
      w.elbow.rotation.set(0, foldAmt * 0.55, elbowZ);
      w.wrist.rotation.set(0, foldAmt * 0.75, wristZ);
      w.tertials.rotation.x = secPitch * 0.5;
      w.secondaries.rotation.x = secPitch;
      w.primaries.rotation.x = priPitch;
      w.primaries.rotation.z = priPitch * 0.3;
    }

    // Body rises through the downstroke, dips on the upstroke
    const bobPhase = stroke(phase - 0.22);
    rig.position.y = -0.011 * bobPhase * flap + Math.sin(time * 0.0016) * 0.004 * glide;
    rig.rotation.x = 0.07 * bobPhase * flap - 0.04 * glide;

    // Ears flop with extra lag, then stream in the wind while gliding
    const earLag = stroke(phase - 0.32);
    const earTipLag = stroke(phase - 0.45);
    const flutter = Math.sin(time * 0.021) * 0.08 + Math.sin(time * 0.033) * 0.04;
    for (let i = 0; i < ears.length; i++) {
      const e = ears[i];
      e.base.rotation.set(-0.95 + 0.2 * earLag * flap + flutter * 0.4, 0, e.side * (-1.05 - 0.22 * earLag * flap));
      e.tip.rotation.set(-0.35 + 0.35 * earTipLag * flap + flutter, 0, e.side * (-0.25 - 0.2 * earTipLag * flap));
    }

    // Halo bobs a little behind the head
    haloGroup.position.y = 0.07 + 0.004 * stroke(phase - 0.4) * flap;
  }

  // Flight path around the Earth (same orbit envelope as before)
  const pos = new THREE.Vector3();
  const next = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const side = new THREE.Vector3();
  const upv = new THREE.Vector3();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  const basis = new THREE.Matrix4();
  const qBank = new THREE.Quaternion();
  const AXIS_Z = new THREE.Vector3(0, 0, 1);

  function pathAt(t: number, out: any) {
    const angle = t * 0.00028 + 1.2;
    const r = 2.45 + 0.15 * Math.sin(t * 0.0006);
    out.set(Math.cos(angle) * r, 0.85 * Math.sin(t * 0.0004) + 0.35, Math.sin(angle) * r);
  }

  function orient(t: number, bankExtra: number) {
    pathAt(t, pos);
    pathAt(t + 120, next);
    lunaRoot.position.copy(pos);
    fwd.subVectors(next, pos).normalize();
    side.crossVectors(WORLD_UP, fwd).normalize();
    upv.crossVectors(fwd, side).normalize();
    basis.makeBasis(side, upv, fwd);
    lunaRoot.quaternion.setFromRotationMatrix(basis);
    // Steady bank into the orbit's right-hand turn, plus a gentle sway
    qBank.setFromAxisAngle(AXIS_Z, 0.22 + bankExtra);
    lunaRoot.quaternion.multiply(qBank);
  }

  // Flight state machine: flapping bouts separated by glides
  let lastTime = -1;
  let clock = 0;
  let phase = 0;
  let beatsLeft = 5;
  let gliding = false;
  let glideLeft = 0;
  let glide = 0; // blended 0..1

  if (reducedMotion) {
    // Still pose: wings spread in a glide, no trail
    orient(2600, 0);
    poseWings(0, 1, 0);
    trailPoints.visible = false;
  }

  return {
    update(time: number) {
      if (reducedMotion) return;
      const dt = lastTime < 0 ? 16 : Math.min(50, time - lastTime);
      lastTime = time;
      clock += dt;

      if (gliding) {
        glideLeft -= dt;
        if (glideLeft <= 0) {
          gliding = false;
          beatsLeft = 4 + Math.floor(Math.random() * 4);
          phase = 0.72; // re-enter on the tail of an upstroke so the first beat is a downstroke
        }
      } else {
        const prev = phase;
        phase += dt / BEAT_MS;
        if (Math.floor(phase) > Math.floor(prev)) {
          beatsLeft--;
          if (beatsLeft <= 0) {
            gliding = true;
            glideLeft = 1300 + Math.random() * 1400;
          }
        }
      }
      // Ease in/out of glides
      const glideTarget = gliding ? 1 : 0;
      glide += (glideTarget - glide) * Math.min(1, dt * 0.006);

      poseWings(phase, glide, clock);

      // Tail wag, legs paddle softly
      tailBase.rotation.z = Math.sin(clock * 0.009) * 0.45;
      tailTip.rotation.z = Math.sin(clock * 0.009 - 0.9) * 0.5;
      for (let i = 0; i < legs.length; i++) {
        legs[i].rotation.z = Math.sin(clock * 0.003 + i * 1.4) * 0.12;
      }
      haloGlowMat.opacity = 0.32 + 0.2 * Math.sin(clock * 0.004);

      orient(time, Math.sin(time * 0.0019) * 0.12);

      // Stardust from the tail, stored in target-local space
      history[historyHead * 3] = pos.x - fwd.x * 0.09;
      history[historyHead * 3 + 1] = pos.y - fwd.y * 0.09;
      history[historyHead * 3 + 2] = pos.z - fwd.z * 0.09;
      historyHead = (historyHead + 1) % trailCount;
      historyFilled = Math.min(trailCount, historyFilled + 1);
      for (let i = 0; i < trailCount; i++) {
        const k = i < historyFilled ? (historyHead - 1 - i + trailCount * 2) % trailCount : (historyHead - 1 + trailCount) % trailCount;
        const j = Math.sin(clock * 0.013 + i * 2.1) * 0.006;
        trailPos[i * 3] = history[k * 3] + j;
        trailPos[i * 3 + 1] = history[k * 3 + 1] - j * 0.7;
        trailPos[i * 3 + 2] = history[k * 3 + 2] + j * 0.5;
      }
      trailPosAttr.needsUpdate = true;
    },
    updateColors() {
      haloMat.color.setHex(isLight() ? 0xd97706 : COLORS.halo);
    },
    destroy() {
      target.remove(lunaRoot);
      target.remove(trailPoints);
      geometries.forEach((geo) => geo.dispose());
      materials.forEach((mat) => mat.dispose());
      nameTagTex.dispose();
    },
  };
}
