import * as THREE from 'three';
import { GlobeContext, GlobeModule, latLonToVec3 } from '../globeTypes';

// ============================================================================
// BAKU -> DETROIT AIRLINER FLIGHT
// A small low-poly airliner flies a great-circle corridor from Baku to Detroit,
// banking through gentle airway turns, trailing a fading contrail, then lands
// with a glow at Detroit and loops. Everything lives in globeGroup so it spins
// with the Earth. All per-frame math reuses preallocated scratch objects.
// ============================================================================

const BAKU = { lat: 40.4093, lon: 49.8671 };
const DETROIT = { lat: 42.3314, lon: -83.0458 };

const SAMPLES = 240;
const CRUISE_ALT = 0.05;
const GROUND_ALT = 0.006;
const PLANE_SCALE = 0.062;
const TRAIL_POINTS = 56;
const TRAIL_SPAN = 0.13; // fraction of the route covered by the contrail

// Timeline (ms)
const HOLD_START = 1400;
const FLIGHT = 17000;
const HOLD_END = 2800;
const CYCLE = HOLD_START + FLIGHT + HOLD_END;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// 0 on the ground, 1 at cruise
const climb = (f: number) => smoothstep(0, 0.14, f) * (1 - smoothstep(0.84, 1, f));

// Time -> route fraction: slower at the ends (takeoff roll / approach), faster in cruise.
const easeRoute = (u: number) => u - (Math.sin(2 * Math.PI * u) / (2 * Math.PI)) * 0.4;

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export function createFlight(ctx: GlobeContext): GlobeModule {
  const { globeGroup, reducedMotion } = ctx;
  const root = new THREE.Group();
  globeGroup.add(root);

  const geometries: any[] = [];
  const materials: any[] = [];
  const g = <T>(geo: T): T => {
    geometries.push(geo);
    return geo;
  };
  const m = <T>(mat: T): T => {
    materials.push(mat);
    return mat;
  };

  // --------------------------------------------------------------------------
  // 1. Precomputed route tables (great circle + gentle airway weave)
  // --------------------------------------------------------------------------
  const a = latLonToVec3(BAKU.lat, BAKU.lon, 1).normalize();
  const b = latLonToVec3(DETROIT.lat, DETROIT.lon, 1).normalize();
  const omega = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
  const sinOmega = Math.sin(omega);
  const planeNormal = new THREE.Vector3().crossVectors(a, b).normalize();

  const posT = new Float32Array((SAMPLES + 1) * 3);
  const upT = new Float32Array((SAMPLES + 1) * 3);
  const tanT = new Float32Array((SAMPLES + 1) * 3);
  const bankT = new Float32Array(SAMPLES + 1);
  const distT = new Float32Array(SAMPLES + 1);

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();

  for (let i = 0; i <= SAMPLES; i++) {
    const f = i / SAMPLES;
    const wa = Math.sin((1 - f) * omega) / sinOmega;
    const wb = Math.sin(f * omega) / sinOmega;
    tmpA.copy(a).multiplyScalar(wa).addScaledVector(b, wb);
    // Lateral weave (two soft airway turns), zero at both airports
    const weave = 0.035 * Math.sin(2 * Math.PI * f) * Math.sin(Math.PI * f);
    tmpA.addScaledVector(planeNormal, weave).normalize();
    upT[i * 3] = tmpA.x;
    upT[i * 3 + 1] = tmpA.y;
    upT[i * 3 + 2] = tmpA.z;
    const r = 1 + GROUND_ALT + (CRUISE_ALT - GROUND_ALT) * climb(f);
    posT[i * 3] = tmpA.x * r;
    posT[i * 3 + 1] = tmpA.y * r;
    posT[i * 3 + 2] = tmpA.z * r;
  }

  let total = 0;
  for (let i = 0; i <= SAMPLES; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(SAMPLES, i + 1);
    tmpA.set(posT[i1 * 3] - posT[i0 * 3], posT[i1 * 3 + 1] - posT[i0 * 3 + 1], posT[i1 * 3 + 2] - posT[i0 * 3 + 2]).normalize();
    tanT[i * 3] = tmpA.x;
    tanT[i * 3 + 1] = tmpA.y;
    tanT[i * 3 + 2] = tmpA.z;
    if (i > 0) {
      tmpB.set(posT[i * 3] - posT[(i - 1) * 3], posT[i * 3 + 1] - posT[(i - 1) * 3 + 1], posT[i * 3 + 2] - posT[(i - 1) * 3 + 2]);
      total += tmpB.length();
    }
    distT[i] = total;
  }

  // Signed turn rate around the local up -> bank angle (left turn = left wing down)
  for (let i = 0; i <= SAMPLES; i++) {
    const i0 = Math.max(0, i - 2);
    const i1 = Math.min(SAMPLES, i + 2);
    tmpA.set(tanT[i0 * 3], tanT[i0 * 3 + 1], tanT[i0 * 3 + 2]);
    tmpB.set(tanT[i1 * 3], tanT[i1 * 3 + 1], tanT[i1 * 3 + 2]);
    tmpC.crossVectors(tmpA, tmpB);
    const turn = tmpC.x * upT[i * 3] + tmpC.y * upT[i * 3 + 1] + tmpC.z * upT[i * 3 + 2];
    const ds = Math.max(1e-5, distT[i1] - distT[i0]);
    bankT[i] = Math.max(-0.55, Math.min(0.55, -(turn / ds) * 0.22)) * climb(i / SAMPLES);
  }
  // Smooth bank so roll-in and roll-out are gradual
  const bankTmp = new Float32Array(SAMPLES + 1);
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i <= SAMPLES; i++) {
      let s = 0;
      let n = 0;
      for (let k = -3; k <= 3; k++) {
        const j = i + k;
        if (j < 0 || j > SAMPLES) continue;
        s += bankT[j];
        n++;
      }
      bankTmp[i] = s / n;
    }
    bankT.set(bankTmp);
  }

  // Scratch sample outputs
  const sPos = new THREE.Vector3();
  const sUp = new THREE.Vector3();
  const sTan = new THREE.Vector3();
  const sSide = new THREE.Vector3();

  function sampleRoute(f: number): number {
    const x = Math.min(SAMPLES, Math.max(0, f * SAMPLES));
    const i = Math.min(SAMPLES - 1, Math.floor(x));
    const t = x - i;
    const j = i + 1;
    sPos.set(
      posT[i * 3] + (posT[j * 3] - posT[i * 3]) * t,
      posT[i * 3 + 1] + (posT[j * 3 + 1] - posT[i * 3 + 1]) * t,
      posT[i * 3 + 2] + (posT[j * 3 + 2] - posT[i * 3 + 2]) * t
    );
    sUp.set(
      upT[i * 3] + (upT[j * 3] - upT[i * 3]) * t,
      upT[i * 3 + 1] + (upT[j * 3 + 1] - upT[i * 3 + 1]) * t,
      upT[i * 3 + 2] + (upT[j * 3 + 2] - upT[i * 3 + 2]) * t
    ).normalize();
    sTan.set(
      tanT[i * 3] + (tanT[j * 3] - tanT[i * 3]) * t,
      tanT[i * 3 + 1] + (tanT[j * 3 + 1] - tanT[i * 3 + 1]) * t,
      tanT[i * 3 + 2] + (tanT[j * 3 + 2] - tanT[i * 3 + 2]) * t
    ).normalize();
    // side = up x forward (points to the plane's left / +X)
    sSide.crossVectors(sUp, sTan).normalize();
    const dist = distT[i] + (distT[j] - distT[i]) * t;
    routeDist = dist;
    return bankT[i] + (bankT[j] - bankT[i]) * t;
  }
  let routeDist = 0;

  // --------------------------------------------------------------------------
  // 2. Route line: dashed, glowing, marching toward Detroit
  // --------------------------------------------------------------------------
  const routeGeo = g(new THREE.BufferGeometry());
  const routePos = new Float32Array((SAMPLES + 1) * 3);
  const routeDistAttr = new Float32Array(SAMPLES + 1);
  for (let i = 0; i <= SAMPLES; i++) {
    const r = 0.997;
    routePos[i * 3] = posT[i * 3] * r;
    routePos[i * 3 + 1] = posT[i * 3 + 1] * r;
    routePos[i * 3 + 2] = posT[i * 3 + 2] * r;
    routeDistAttr[i] = distT[i];
  }
  routeGeo.setAttribute('position', new THREE.BufferAttribute(routePos, 3));
  routeGeo.setAttribute('aDist', new THREE.BufferAttribute(routeDistAttr, 1));

  const routeUniforms = {
    uTime: { value: 0 },
    uHead: { value: 0 },
    uColor: { value: new THREE.Color(0x38bdf8) },
    uHeadColor: { value: new THREE.Color(0xffd48a) },
  };
  const routeMat = m(
    new THREE.ShaderMaterial({
      uniforms: routeUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aDist;
        varying float vDist;
        void main() {
          vDist = aDist;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uHead;
        uniform vec3 uColor;
        uniform vec3 uHeadColor;
        varying float vDist;
        void main() {
          float dash = step(0.45, fract((vDist - uTime * 0.06) / 0.034));
          float flown = step(vDist, uHead);
          float headGlow = exp(-abs(vDist - uHead) * 22.0) * flown;
          float a = 0.16 + dash * mix(0.42, 0.85, flown);
          vec3 col = mix(uColor, uHeadColor, headGlow);
          gl_FragColor = vec4(col, a + headGlow * 0.6);
        }
      `,
    })
  );
  const routeLine = new THREE.Line(routeGeo, routeMat);
  root.add(routeLine);

  // --------------------------------------------------------------------------
  // 3. Airliner model (unit length ~1 along +Z forward, +Y up, +X left wing)
  // --------------------------------------------------------------------------
  const plane = new THREE.Group();
  plane.scale.setScalar(PLANE_SCALE);
  root.add(plane);

  const bodyMat = m(new THREE.MeshLambertMaterial({ color: 0xf4f6fa, emissive: 0x3a4250 }));
  const wingMat = m(new THREE.MeshLambertMaterial({ color: 0xc9d1dc, emissive: 0x2a3140, side: THREE.DoubleSide }));
  const tailMat = m(new THREE.MeshLambertMaterial({ color: 0x0ea5e9, emissive: 0x0b3a55, side: THREE.DoubleSide }));
  const engineMat = m(new THREE.MeshLambertMaterial({ color: 0x9aa4b2, emissive: 0x20252e }));
  const darkMat = m(new THREE.MeshBasicMaterial({ color: 0x0f172a }));
  const stripeMat = m(new THREE.MeshBasicMaterial({ color: 0x0ea5e9 }));

  // Fuselage via lathe (tail at -Z, nose at +Z)
  const profile = [
    [0.0, -0.5],
    [0.018, -0.49],
    [0.04, -0.42],
    [0.062, -0.3],
    [0.072, -0.18],
    [0.074, 0.28],
    [0.07, 0.36],
    [0.058, 0.43],
    [0.036, 0.48],
    [0.012, 0.5],
    [0.0, 0.502],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const fuselageGeo = g(new THREE.LatheGeometry(profile, 14));
  fuselageGeo.rotateX(Math.PI / 2);
  plane.add(new THREE.Mesh(fuselageGeo, bodyMat));

  // Cabin window strips (box slightly wider than the fuselage so only the sides show)
  const windowGeo = g(new THREE.BoxGeometry(0.1505, 0.016, 0.56));
  const windows = new THREE.Mesh(windowGeo, darkMat);
  windows.position.set(0, 0.022, 0.02);
  plane.add(windows);
  // Cheatline under the windows
  const cheatGeo = g(new THREE.BoxGeometry(0.1495, 0.01, 0.74));
  const cheat = new THREE.Mesh(cheatGeo, stripeMat);
  cheat.position.set(0, -0.004, 0.0);
  plane.add(cheat);
  // Cockpit windscreen
  const cockpitGeo = g(new THREE.BoxGeometry(0.07, 0.022, 0.05));
  const cockpit = new THREE.Mesh(cockpitGeo, darkMat);
  cockpit.position.set(0, 0.036, 0.425);
  cockpit.rotation.x = 0.35;
  plane.add(cockpit);

  // Swept wing: shape in (x = span, y = forward), extruded thin, laid flat
  function sweptSurface(root0: number, span: number, rootLE: number, rootTE: number, sweep: number, tipChord: number, thick: number) {
    const s = new THREE.Shape();
    s.moveTo(root0, rootLE);
    s.lineTo(root0 + span, rootLE - sweep);
    s.lineTo(root0 + span, rootLE - sweep - tipChord);
    s.lineTo(root0, rootTE);
    s.closePath();
    const geo = g(new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false }));
    geo.rotateX(Math.PI / 2); // shape y -> +Z forward, extrude -> -Y
    geo.translate(0, thick / 2, 0);
    return geo;
  }

  const wingGeo = sweptSurface(0.05, 0.5, 0.16, -0.08, 0.3, 0.08, 0.018);
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(0, -0.03, 0);
  wingL.rotation.z = 0.08; // dihedral
  plane.add(wingL);
  const wingRGroup = new THREE.Group();
  wingRGroup.scale.x = -1;
  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.position.set(0, -0.03, 0);
  wingR.rotation.z = 0.08;
  wingRGroup.add(wingR);
  plane.add(wingRGroup);

  // Winglets
  const wingletGeo = g(new THREE.BoxGeometry(0.008, 0.06, 0.06));
  [1, -1].forEach((side) => {
    const wl = new THREE.Mesh(wingletGeo, tailMat);
    wl.position.set(side * 0.548, 0.035, -0.18);
    wl.rotation.z = side * -0.25;
    plane.add(wl);
  });

  // Horizontal stabilizers
  const stabGeo = sweptSurface(0.02, 0.19, -0.33, -0.46, 0.12, 0.06, 0.012);
  const stabL = new THREE.Mesh(stabGeo, wingMat);
  stabL.position.y = 0.012;
  plane.add(stabL);
  const stabRGroup = new THREE.Group();
  stabRGroup.scale.x = -1;
  const stabR = new THREE.Mesh(stabGeo, wingMat);
  stabR.position.y = 0.012;
  stabRGroup.add(stabR);
  plane.add(stabRGroup);

  // Vertical fin: shape in (x = forward, y = up)
  const finShape = new THREE.Shape();
  finShape.moveTo(-0.28, 0.05);
  finShape.lineTo(-0.44, 0.3);
  finShape.lineTo(-0.52, 0.3);
  finShape.lineTo(-0.49, 0.05);
  finShape.closePath();
  const finGeo = g(new THREE.ExtrudeGeometry(finShape, { depth: 0.012, bevelEnabled: false }));
  finGeo.rotateY(-Math.PI / 2); // shape x -> +Z
  finGeo.translate(0.006, 0, 0);
  plane.add(new THREE.Mesh(finGeo, tailMat));

  // Engines under the wings
  const nacelleGeo = g(new THREE.CylinderGeometry(0.036, 0.03, 0.17, 12, 1, false));
  nacelleGeo.rotateX(Math.PI / 2);
  const intakeGeo = g(new THREE.CircleGeometry(0.03, 12));
  const pylonGeo = g(new THREE.BoxGeometry(0.012, 0.04, 0.09));
  const engineOffsets: number[] = [0.2, -0.2];
  engineOffsets.forEach((x) => {
    const nac = new THREE.Mesh(nacelleGeo, engineMat);
    nac.position.set(x, -0.075, 0.1);
    plane.add(nac);
    const intake = new THREE.Mesh(intakeGeo, darkMat);
    intake.position.set(x, -0.075, 0.186);
    plane.add(intake);
    const pylon = new THREE.Mesh(pylonGeo, engineMat);
    pylon.position.set(x, -0.045, 0.07);
    plane.add(pylon);
  });

  // Nav lights + strobes (additive glow sprites)
  const glowTex = makeGlowTexture();
  function makeLight(color: number, x: number, y: number, z: number, size: number) {
    const mat = m(
      new THREE.SpriteMaterial({
        map: glowTex,
        color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    s.scale.setScalar(size);
    plane.add(s);
    return mat;
  }
  const navRed = makeLight(0xff2a2a, 0.555, 0.0, -0.17, 0.2); // left (port)
  const navGreen = makeLight(0x22ff66, -0.555, 0.0, -0.17, 0.2); // right (starboard)
  const strobeL = makeLight(0xffffff, 0.56, 0.0, -0.2, 0.34);
  const strobeR = makeLight(0xffffff, -0.56, 0.0, -0.2, 0.34);
  const strobeTail = makeLight(0xffffff, 0, 0.02, -0.51, 0.3);
  const beacon = makeLight(0xff3b3b, 0, 0.09, 0.05, 0.22);
  navRed.opacity = 0.95;
  navGreen.opacity = 0.95;

  // --------------------------------------------------------------------------
  // 4. Contrail (two engine lines, recomputed from the route: no history arrays)
  // --------------------------------------------------------------------------
  const trailUniforms = { uOpacity: { value: 1 } };
  const trailMat = m(
    new THREE.ShaderMaterial({
      uniforms: trailUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute float aFade;
        attribute float aEdge;
        varying float vFade;
        varying float vEdge;
        void main() {
          vFade = aFade;
          vEdge = aEdge;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vFade;
        varying float vEdge;
        void main() {
          float soft = 1.0 - vEdge * vEdge;
          gl_FragColor = vec4(vec3(0.94, 0.97, 1.0), vFade * soft * uOpacity * 0.7);
        }
      `,
    })
  );
  // One soft ribbon per engine, lying flat along the surface; rebuilt from the
  // route tables each frame into preallocated buffers (no history arrays).
  const trails: { geo: any; pos: Float32Array; fade: Float32Array; side: number }[] = [];
  const trailIndex: number[] = [];
  for (let j = 0; j < TRAIL_POINTS - 1; j++) {
    const a0 = j * 2;
    trailIndex.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
  }
  engineOffsets.forEach((x) => {
    const geo = g(new THREE.BufferGeometry());
    const pos = new Float32Array(TRAIL_POINTS * 2 * 3);
    const fade = new Float32Array(TRAIL_POINTS * 2);
    const edge = new Float32Array(TRAIL_POINTS * 2);
    for (let j = 0; j < TRAIL_POINTS; j++) {
      edge[j * 2] = -1;
      edge[j * 2 + 1] = 1;
    }
    const posAttr = new THREE.BufferAttribute(pos, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const fadeAttr = new THREE.BufferAttribute(fade, 1);
    fadeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('aFade', fadeAttr);
    geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
    geo.setIndex(trailIndex);
    const ribbon = new THREE.Mesh(geo, trailMat);
    ribbon.frustumCulled = false;
    root.add(ribbon);
    trails.push({ geo, pos, fade, side: x > 0 ? 1 : -1 });
  });

  function writeTrail(f: number) {
    for (let k = 0; k < trails.length; k++) {
      const tr = trails[k];
      for (let j = 0; j < TRAIL_POINTS; j++) {
        const age = j / (TRAIL_POINTS - 1);
        const fj = Math.max(0, f - 0.004 - age * TRAIL_SPAN);
        sampleRoute(fj);
        const spread = (0.2 + age * 0.3) * PLANE_SCALE * tr.side;
        const drop = (0.07 + age * 0.05) * PLANE_SCALE;
        const halfW = (0.03 + age * 0.13) * PLANE_SCALE;
        const cx = sPos.x + sSide.x * spread - sUp.x * drop;
        const cy = sPos.y + sSide.y * spread - sUp.y * drop;
        const cz = sPos.z + sSide.z * spread - sUp.z * drop;
        const o = j * 6;
        tr.pos[o] = cx - sSide.x * halfW;
        tr.pos[o + 1] = cy - sSide.y * halfW;
        tr.pos[o + 2] = cz - sSide.z * halfW;
        tr.pos[o + 3] = cx + sSide.x * halfW;
        tr.pos[o + 4] = cy + sSide.y * halfW;
        tr.pos[o + 5] = cz + sSide.z * halfW;
        const alt = climb(fj);
        const a = Math.pow(1 - age, 1.4) * alt * alt * Math.min(1, age * 12 + 0.25);
        tr.fade[j * 2] = a;
        tr.fade[j * 2 + 1] = a;
      }
      tr.geo.attributes.position.needsUpdate = true;
      tr.geo.attributes.aFade.needsUpdate = true;
    }
  }

  // --------------------------------------------------------------------------
  // 5. Airport glows (takeoff at Baku, landing at Detroit)
  // --------------------------------------------------------------------------
  const ringGeo = g(new THREE.RingGeometry(0.02, 0.028, 40));
  function makeAirportGlow(lat: number, lon: number, color: number) {
    const normal = latLonToVec3(lat, lon, 1).normalize();
    const group = new THREE.Group();
    group.position.copy(normal).multiplyScalar(1.006);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const ringMat = m(
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);
    const flareMat = m(
      new THREE.SpriteMaterial({
        map: glowTex,
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const flare = new THREE.Sprite(flareMat);
    flare.scale.setScalar(0.09);
    group.add(flare);
    root.add(group);
    return { ring, ringMat, flare, flareMat };
  }
  const takeoffGlow = makeAirportGlow(BAKU.lat, BAKU.lon, 0x38bdf8);
  const landingGlow = makeAirportGlow(DETROIT.lat, DETROIT.lon, 0xffb347);

  // --------------------------------------------------------------------------
  // 6. Pose
  // --------------------------------------------------------------------------
  const basis = new THREE.Matrix4();
  const qRoll = new THREE.Quaternion();
  const qPitch = new THREE.Quaternion();
  const AXIS_Z = new THREE.Vector3(0, 0, 1);
  const AXIS_X = new THREE.Vector3(1, 0, 0);
  const yAxis = new THREE.Vector3();

  function posePlane(f: number, extraPitch: number, extraRoll: number) {
    const bank = sampleRoute(f);
    // Orthonormal frame: forward = path tangent, up = surface normal re-orthogonalized
    yAxis.crossVectors(sTan, sSide).normalize();
    basis.makeBasis(sSide, yAxis, sTan);
    plane.position.copy(sPos);
    plane.quaternion.setFromRotationMatrix(basis);
    qRoll.setFromAxisAngle(AXIS_Z, bank + extraRoll);
    qPitch.setFromAxisAngle(AXIS_X, -extraPitch);
    plane.quaternion.multiply(qRoll).multiply(qPitch);
    routeUniforms.uHead.value = routeDist;
  }

  function setGlow(glow: ReturnType<typeof makeAirportGlow>, k: number, strength: number) {
    // k: 0..1 progress through the pulse
    const s = 1 + k * 2.6;
    glow.ring.scale.setScalar(s);
    glow.ringMat.opacity = (1 - k) * strength;
    glow.flareMat.opacity = Math.sin(Math.PI * Math.min(1, k * 1.4)) * strength;
  }

  let lastTime = -1;
  let clock = 0;

  if (reducedMotion) {
    // Still pose: plane parked mid-route, lights steady, no marching dashes.
    posePlane(0.55, 0, 0);
    writeTrail(0.55);
    strobeL.opacity = 0.35;
    strobeR.opacity = 0.35;
    strobeTail.opacity = 0.35;
    beacon.opacity = 0.6;
    setGlow(landingGlow, 0.25, 0.5);
  }

  return {
    update(time: number) {
      if (reducedMotion) return;
      const dt = lastTime < 0 ? 16 : Math.min(50, time - lastTime);
      lastTime = time;
      clock += dt;
      const tc = clock % CYCLE;

      let f: number;
      let planeScale = PLANE_SCALE;
      let trailOpacity = 1;
      if (tc < HOLD_START) {
        // Lined up at Baku: grow in, takeoff pulse
        f = 0;
        const k = tc / HOLD_START;
        planeScale = PLANE_SCALE * smoothstep(0, 0.35, k);
        setGlow(takeoffGlow, k, 0.8);
        setGlow(landingGlow, 1, 0);
        trailOpacity = 0;
      } else if (tc < HOLD_START + FLIGHT) {
        const u = (tc - HOLD_START) / FLIGHT;
        f = easeRoute(u);
        setGlow(takeoffGlow, 1, 0);
        // Detroit starts pulsing softly on final approach
        const approach = smoothstep(0.9, 1, u);
        setGlow(landingGlow, 0.15, approach * 0.5);
      } else {
        // Landed at Detroit: landing glow, contrail dissipates, plane shrinks away
        f = 1;
        const k = (tc - HOLD_START - FLIGHT) / HOLD_END;
        setGlow(landingGlow, Math.min(1, k * 1.2), 1);
        trailOpacity = 1 - smoothstep(0, 0.6, k);
        planeScale = PLANE_SCALE * (1 - smoothstep(0.75, 1, k));
      }

      const cl = climb(f);
      const pitchWobble = Math.sin(clock * 0.0011) * 0.025 * cl;
      // Nose up on climb-out, slightly down on descent (on top of the path slope)
      const phasePitch = (smoothstep(0.0, 0.06, f) - smoothstep(0.06, 0.16, f)) * 0.12 - (smoothstep(0.84, 0.92, f) - smoothstep(0.95, 1, f)) * 0.05;
      const rollWobble = Math.sin(clock * 0.0017) * 0.03 * cl;
      posePlane(f, pitchWobble + phasePitch, rollWobble);
      plane.scale.setScalar(Math.max(0.0001, planeScale));
      plane.visible = planeScale > 0.0002;

      trailUniforms.uOpacity.value = trailOpacity;
      writeTrail(f);

      routeUniforms.uTime.value = clock * 0.001;

      // Strobes: double flash every 1.3 s; red beacon every 1.0 s
      const sp = (clock % 1300) / 1300;
      const flash = sp < 0.04 || (sp > 0.1 && sp < 0.14) ? 1 : 0;
      strobeL.opacity = flash;
      strobeR.opacity = flash;
      strobeTail.opacity = (clock + 650) % 1300 < 60 ? 1 : 0;
      const bp = (clock % 1000) / 1000;
      beacon.opacity = bp < 0.12 ? 1 - bp / 0.12 : 0;
    },
    destroy() {
      globeGroup.remove(root);
      geometries.forEach((geo) => geo.dispose());
      materials.forEach((mat) => mat.dispose());
      glowTex.dispose();
    },
  };
}
