import * as THREE from 'three';
import { CONSTELLATIONS } from '../data/constellations.js';
import { PLANETS } from '../data/planets.js';
import { GlobeContext, GlobeModule, latLonToVec3, sphericalToVec3 } from '../globeTypes';

const isLight = () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light';

// ============================================================================
// 1. STARFIELD MODULE
// ============================================================================
const STAR_COLORS: [number, number, number][] = [
  [1.0, 1.0, 1.0],   // White (70%)
  [0.75, 0.85, 1.0], // Blue-white (15%)
  [1.0, 0.95, 0.7],  // Yellow (10%)
  [1.0, 0.7, 0.4],   // Orange-red (5%)
];
const STAR_COLOR_WEIGHTS = [0.7, 0.85, 0.95, 1.0];

function pickStarColor(): [number, number, number] {
  const r = Math.random();
  for (let i = 0; i < STAR_COLOR_WEIGHTS.length; i++) {
    if (r < STAR_COLOR_WEIGHTS[i]) return STAR_COLORS[i];
  }
  return STAR_COLORS[0];
}

function makeStarLayer(
  count: number,
  rMin: number,
  rMax: number,
  baseSize: number,
  baseOpacity: number,
  redGiantChance = 0
) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const r = rMin + Math.random() * (rMax - rMin);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const isRedGiant = redGiantChance > 0 && Math.random() < redGiantChance;
    if (isRedGiant) {
      colors[i * 3 + 0] = 0.95 + Math.random() * 0.05;
      colors[i * 3 + 1] = 0.35 + Math.random() * 0.1;
      colors[i * 3 + 2] = 0.15 + Math.random() * 0.1;
      sizes[i] = baseSize * (2.0 + Math.random() * 1.0);
    } else {
      const c = pickStarColor();
      colors[i * 3 + 0] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
      sizes[i] = baseSize;
    }

    phases[i] = Math.random() * Math.PI * 2;
    speeds[i] = 0.001 + Math.random() * 0.003;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const light = isLight();
  const mat = new THREE.PointsMaterial({
    size: baseSize,
    transparent: true,
    opacity: light ? baseOpacity * 0.55 : baseOpacity,
    sizeAttenuation: true,
    vertexColors: true,
  });

  const points = new THREE.Points(geo, mat);
  const origColors = new Float32Array(colors);
  return { points, mat, geo, phases, speeds, baseSize, baseOpacity, count, origColors };
}

export function createStarfield(ctx: GlobeContext): GlobeModule {
  const { isMobile, universeGroup, scene } = ctx;
  const target = universeGroup || scene;

  // Multi-tier depth shells with spectral distribution and cosmic stellar dust
  const layer1 = makeStarLayer(isMobile ? 1200 : 4500, 14, 36, 0.048, 0.85, 0.025);
  const layer2 = makeStarLayer(isMobile ? 600 : 2500, 28, 52, 0.028, 0.5, 0.015);
  const layer3 = makeStarLayer(isMobile ? 500 : 2200, 45, 75, 0.018, 0.3);
  const layer4 = makeStarLayer(isMobile ? 400 : 1800, 12, 40, 0.032, 0.25);

  target.add(layer1.points);
  target.add(layer2.points);
  target.add(layer3.points);
  target.add(layer4.points);

  const layers = [layer1, layer2, layer3, layer4];
  let frameCount = 0;

  return {
    update(time: number) {
      frameCount++;
      if (isMobile && frameCount % 3 !== 0) return;

      // Twinkle primary and mid-field stars
      [layer1, layer2].forEach((layer) => {
        const colorAttr = layer.geo.getAttribute('color');
        const cArr = colorAttr.array as Float32Array;
        for (let i = 0; i < layer.count; i++) {
          const twinkle = 0.65 + 0.35 * Math.sin(time * layer.speeds[i] + layer.phases[i]);
          cArr[i * 3 + 0] = layer.origColors[i * 3 + 0] * twinkle;
          cArr[i * 3 + 1] = layer.origColors[i * 3 + 1] * twinkle;
          cArr[i * 3 + 2] = layer.origColors[i * 3 + 2] * twinkle;
        }
        colorAttr.needsUpdate = true;
      });
    },
    updateColors() {
      const light = isLight();
      layers.forEach((l) => {
        l.mat.opacity = light ? l.baseOpacity * 0.55 : l.baseOpacity;
        const cArr = l.geo.getAttribute('color').array as Float32Array;
        const factor = light ? 0.35 : 1.0;
        for (let i = 0; i < l.count * 3; i++) {
          cArr[i] = l.origColors[i] * factor;
        }
        l.geo.getAttribute('color').needsUpdate = true;
      });
    },
    destroy() {
      layers.forEach((l) => {
        target.remove(l.points);
        l.geo.dispose();
        l.mat.dispose();
      });
    },
  };
}

// ============================================================================
// 2. CONSTELLATIONS MODULE
// ============================================================================
const EDGE_STAGGER_MS = 600;
const EDGE_FADE_MS = 800;
const LABEL_FADE_MS = 1200;
const CONSTELLATION_START_DELAY = 2000;

function makeConstellationLabel(name: string, position: THREE.Vector3) {
  const canvas2d = document.createElement('canvas');
  const sz = 256;
  canvas2d.width = sz;
  canvas2d.height = 64;
  const ctx = canvas2d.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, sz, 64);
    ctx.shadowColor = '#aaccff';
    ctx.shadowBlur = 8;
    ctx.font = '700 24px "Space Mono", monospace';
    ctx.fillStyle = '#ccddff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, sz / 2, 32);
    ctx.shadowBlur = 0;
    ctx.fillText(name, sz / 2, 32);
  }
  const tex = new THREE.CanvasTexture(canvas2d);
  tex.needsUpdate = true;
  const spriteMat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.copy(position);
  sprite.scale.set(2.6, 0.65, 1);
  return { sprite, mat: spriteMat, tex };
}

export function createConstellations(ctx: GlobeContext): GlobeModule {
  const { scene, universeGroup } = ctx;
  const isLightInit = isLight();

  const constellationGroup = new THREE.Group();
  const target = universeGroup || scene;
  target.add(constellationGroup);

  const constellationStarMat = new THREE.PointsMaterial({
    color: isLightInit ? 0x475569 : 0xddeeff,
    size: 0.1,
    transparent: true,
    opacity: isLightInit ? 0.6 : 0.9,
    sizeAttenuation: true,
  });

  const constellationData: Array<{
    name: string;
    edgeLines: Array<{ line: THREE.Line; mat: THREE.LineBasicMaterial; geo: THREE.BufferGeometry }>;
    label: ReturnType<typeof makeConstellationLabel>;
    startTime: number;
    points: THREE.Points;
    pointGeo: THREE.BufferGeometry;
  }> = [];

  CONSTELLATIONS.forEach((c: any, ci: number) => {
    const positions: THREE.Vector3[] = c.stars.map(([th, ph]: [number, number]) =>
      sphericalToVec3(th, ph, c.radius)
    );

    const starPos = new Float32Array(positions.length * 3);
    positions.forEach((p, i) => {
      starPos[i * 3] = p.x;
      starPos[i * 3 + 1] = p.y;
      starPos[i * 3 + 2] = p.z;
    });
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starPoints = new THREE.Points(sGeo, constellationStarMat);
    constellationGroup.add(starPoints);

    const edgeLines: Array<{ line: THREE.Line; mat: THREE.LineBasicMaterial; geo: THREE.BufferGeometry }> = [];
    c.edges.forEach(([a, b]: [number, number]) => {
      const edgeMat = new THREE.LineBasicMaterial({
        color: isLightInit ? 0x475569 : 0xaaccff,
        transparent: true,
        opacity: 0,
        linewidth: 1,
      });
      const lineGeo = new THREE.BufferGeometry().setFromPoints([positions[a], positions[b]]);
      const line = new THREE.Line(lineGeo, edgeMat);
      constellationGroup.add(line);
      edgeLines.push({ line, mat: edgeMat, geo: lineGeo });
    });

    const centroid = new THREE.Vector3();
    positions.forEach((p) => centroid.add(p));
    centroid.divideScalar(positions.length);
    const cDir = centroid.clone().normalize();
    const labelPos = centroid
      .clone()
      .add(cDir.clone().multiplyScalar(1.8))
      .add(new THREE.Vector3(0, 0.6, 0));

    const label = makeConstellationLabel(c.name, labelPos);
    constellationGroup.add(label.sprite);

    constellationData.push({
      name: c.name,
      edgeLines,
      label,
      startTime: ci * CONSTELLATION_START_DELAY,
      points: starPoints,
      pointGeo: sGeo,
    });
  });

  const state = { labelsVisible: true };

  return {
    constellationData,
    state,
    update(time: number) {
      const light = isLight();
      const baseLineOpacity = light ? 0.4 : 0.5;

      constellationData.forEach((cd) => {
        const elapsed = time - cd.startTime;
        if (elapsed < 0) return;

        cd.edgeLines.forEach((edge, ei) => {
          const edgeStart = ei * EDGE_STAGGER_MS;
          const edgeElapsed = elapsed - edgeStart;
          if (edgeElapsed <= 0) {
            edge.mat.opacity = 0;
          } else if (edgeElapsed < EDGE_FADE_MS) {
            edge.mat.opacity = baseLineOpacity * (edgeElapsed / EDGE_FADE_MS);
          } else {
            const shimmer = 0.85 + 0.15 * Math.sin(time * 0.002 + ei * 1.3);
            edge.mat.opacity = baseLineOpacity * shimmer;
          }
          edge.mat.color.setHex(light ? 0x475569 : 0xaaccff);
        });

        const allEdgesDone = cd.edgeLines.length * EDGE_STAGGER_MS + EDGE_FADE_MS;
        const labelElapsed = elapsed - allEdgesDone;
        if (!state.labelsVisible) {
          cd.label.mat.opacity += (0 - cd.label.mat.opacity) * 0.08;
        } else if (labelElapsed <= 0) {
          cd.label.mat.opacity += (0 - cd.label.mat.opacity) * 0.08;
        } else if (labelElapsed < LABEL_FADE_MS) {
          const targetOp = 0.75 * (labelElapsed / LABEL_FADE_MS);
          cd.label.mat.opacity += (targetOp - cd.label.mat.opacity) * 0.08;
        } else {
          const lp = 0.9 + 0.1 * Math.sin(time * 0.0015 + cd.startTime * 0.001);
          cd.label.mat.opacity += (0.75 * lp - cd.label.mat.opacity) * 0.08;
        }
      });
    },
    updateColors() {
      const light = isLight();
      constellationStarMat.color.setHex(light ? 0x475569 : 0xddeeff);
      constellationStarMat.opacity = light ? 0.6 : 0.9;
      constellationData.forEach((cd) => {
        cd.label.mat.color = light ? new THREE.Color(0x475569) : new THREE.Color(0xaaccff);
      });
    },
    destroy() {
      target.remove(constellationGroup);
      constellationStarMat.dispose();
      constellationData.forEach((cd) => {
        cd.pointGeo.dispose();
        cd.edgeLines.forEach((e) => {
          e.geo.dispose();
          e.mat.dispose();
        });
        cd.label.mat.dispose();
        cd.label.tex.dispose();
      });
    },
  };
}

// ============================================================================
// 3. PLANETS MODULE
// ============================================================================
function makePlanetLabel(name: string, position: THREE.Vector3, color: number) {
  const canvas2d = document.createElement('canvas');
  const sz = 128;
  canvas2d.width = sz;
  canvas2d.height = 48;
  const ctx = canvas2d.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, sz, 48);
    ctx.font = '500 16px "Space Mono", monospace';
    ctx.fillStyle = '#' + new THREE.Color(color).getHexString();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, sz / 2, 24);
  }
  const tex = new THREE.CanvasTexture(canvas2d);
  tex.needsUpdate = true;
  const spriteMat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.copy(position);
  const sf = name === 'Sun' ? 2.8 : 1.6;
  sprite.scale.set(sf, sf * 0.375, 1);
  return { sprite, mat: spriteMat, tex };
}

export function createPlanets(ctx: GlobeContext): GlobeModule {
  const { universeGroup } = ctx;
  const planetMeshes: Array<{
    mesh: THREE.Mesh;
    glow: THREE.Mesh;
    glowMat: THREE.MeshBasicMaterial;
    label: ReturnType<typeof makePlanetLabel>;
    def: any;
  }> = [];

  PLANETS.forEach((p: any) => {
    const pos = sphericalToVec3(p.theta, p.phi, p.radius);

    const pMat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.size, 16, 16), pMat);
    mesh.position.copy(pos);
    universeGroup.add(mesh);

    const glowSize = p.isSun ? 2.5 : 1.8;
    const glowOpacity = p.isSun ? 0.2 : 0.15;
    const glowMat = new THREE.MeshBasicMaterial({
      color: p.emissive,
      transparent: true,
      opacity: glowOpacity,
      side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(p.size * glowSize, 16, 16), glowMat);
    glow.position.copy(pos);
    universeGroup.add(glow);

    if (p.isSun) {
      const coronaMat = new THREE.MeshBasicMaterial({
        color: 0xffaa22,
        transparent: true,
        opacity: 0.06,
        side: THREE.BackSide,
      });
      const corona = new THREE.Mesh(new THREE.SphereGeometry(p.size * 4, 16, 16), coronaMat);
      corona.position.copy(pos);
      universeGroup.add(corona);
    }

    if (p.rings) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xddc880,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(p.size * 1.4, p.size * 2.2, 32),
        ringMat
      );
      ringMesh.position.copy(pos);
      ringMesh.rotation.x = Math.PI * 0.35;
      ringMesh.rotation.z = Math.PI * 0.1;
      universeGroup.add(ringMesh);
    }

    const radial = pos.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    let sideways = new THREE.Vector3().crossVectors(radial, up);
    if (sideways.length() < 0.01) sideways = new THREE.Vector3(1, 0, 0);
    sideways.normalize();
    const labelOffset = sideways
      .multiplyScalar(p.size * 2.0 + 0.5)
      .add(up.clone().multiplyScalar(p.size * 1.5 + 0.2));
    const label = makePlanetLabel(p.name, pos.clone().add(labelOffset), p.color);
    universeGroup.add(label.sprite);

    planetMeshes.push({ mesh, glow, glowMat, label, def: p });
  });

  const state = { labelsVisible: true };

  return {
    planetMeshes,
    state,
    update(time: number) {
      planetMeshes.forEach((p) => {
        const gp = 0.5 + 0.5 * Math.sin(time * 0.002 + p.def.theta);
        p.glowMat.opacity = p.def.isSun ? 0.15 + gp * 0.1 : 0.1 + gp * 0.1;
        if (p.label) {
          const targetOp = state.labelsVisible
            ? 0.5 + 0.15 * Math.sin(time * 0.0018 + p.def.theta * 2)
            : 0;
          p.label.mat.opacity += (targetOp - p.label.mat.opacity) * 0.08;
        }
      });
    },
    destroy() {
      planetMeshes.forEach((p) => {
        universeGroup.remove(p.mesh);
        universeGroup.remove(p.glow);
        universeGroup.remove(p.label.sprite);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        p.glow.geometry.dispose();
        p.glowMat.dispose();
        p.label.mat.dispose();
        p.label.tex.dispose();
      });
    },
  };
}

// ============================================================================
// 4. SHUTTLE & SPACE LAUNCH MODULE
// ============================================================================
export function createShuttle(ctx: GlobeContext): GlobeModule {
  const { scene, globeGroup, isMobile } = ctx;

  // 1. Space Shuttle Artemis II
  const shuttleGroup = new THREE.Group();
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.9 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.14, 8), bodyMat);
  body.rotation.z = Math.PI / 2;
  shuttleGroup.add(body);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.015, 0.04, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 0.09;
  shuttleGroup.add(nose);

  const wingMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
  const wingGeo = new THREE.PlaneGeometry(0.06, 0.008);
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(-0.01, 0.03, 0);
  wingL.rotation.z = 0.3;
  shuttleGroup.add(wingL);
  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.position.set(-0.01, -0.03, 0);
  wingR.rotation.z = -0.3;
  shuttleGroup.add(wingR);

  const engineMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8 });
  const engine = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), engineMat);
  engine.position.x = -0.08;
  shuttleGroup.add(engine);

  scene.add(shuttleGroup);

  const exhaustCount = isMobile ? 12 : 25;
  const exhaustPos = new Float32Array(exhaustCount * 3);
  const exhaustGeo = new THREE.BufferGeometry();
  exhaustGeo.setAttribute('position', new THREE.BufferAttribute(exhaustPos, 3));
  const exhaustMat = new THREE.PointsMaterial({
    color: 0xff9900,
    size: 0.012,
    transparent: true,
    opacity: 0.35,
    sizeAttenuation: true,
  });
  const exhaustPoints = new THREE.Points(exhaustGeo, exhaustMat);
  scene.add(exhaustPoints);
  const exhaustHistory: THREE.Vector3[] = [];

  // 2. ISS
  const issGroup = new THREE.Group();
  const trussMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
  const truss = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 6), trussMat);
  truss.rotation.z = Math.PI / 2;
  issGroup.add(truss);

  const solarMat = new THREE.MeshBasicMaterial({ color: 0x1f3c73, side: THREE.DoubleSide });
  [
    [-0.02, 0.025],
    [-0.02, -0.025],
    [0.02, 0.025],
    [0.02, -0.025],
  ].forEach(([xp, zp]) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.01), solarMat);
    panel.position.set(xp, 0, zp);
    issGroup.add(panel);
  });
  const hab = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.02, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  issGroup.add(hab);
  scene.add(issGroup);

  // 4. Occasional Space Launches
  const launchGroup = new THREE.Group();
  const launchRocketMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
  const launchFlameMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0 });

  const rBody = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.05, 6), launchRocketMat);
  rBody.rotation.z = Math.PI / 2;
  launchGroup.add(rBody);

  const rCone = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.015, 6), launchRocketMat);
  rCone.rotation.z = -Math.PI / 2;
  rCone.position.x = 0.0325;
  launchGroup.add(rCone);

  const rFlame = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), launchFlameMat);
  rFlame.position.x = -0.03;
  launchGroup.add(rFlame);
  scene.add(launchGroup);

  const launchExhCount = isMobile ? 20 : 60;
  const launchExhPos = new Float32Array(launchExhCount * 3);
  const launchExhGeo = new THREE.BufferGeometry();
  launchExhGeo.setAttribute('position', new THREE.BufferAttribute(launchExhPos, 3));
  const launchExhMat = new THREE.PointsMaterial({
    color: 0xcccccc,
    size: 0.018,
    transparent: true,
    opacity: 0,
    sizeAttenuation: true,
  });
  const launchPoints = new THREE.Points(launchExhGeo, launchExhMat);
  scene.add(launchPoints);
  const launchExhHistory: THREE.Vector3[] = [];

  let launchState = 'idle';
  let launchProgress = 0;
  let launchTimer = 6000;
  let launchSite = 'detroit';
  let launchPos = new THREE.Vector3();
  const launchNormal = new THREE.Vector3();
  const orbitNormal = new THREE.Vector3();

  function triggerLaunch() {
    launchState = 'ignition';
    launchProgress = 0;
    launchSite = Math.random() > 0.5 ? 'detroit' : 'baku';

    const lat = launchSite === 'detroit' ? 42.3314 : 40.4093;
    const lon = launchSite === 'detroit' ? -83.0458 : 49.8671;
    launchPos = latLonToVec3(lat, lon, 1.02);
    launchPos.applyEuler(globeGroup.rotation);
    launchNormal.copy(launchPos).normalize();

    const eastVec = new THREE.Vector3(0, 1, 0).cross(launchNormal).normalize();
    orbitNormal.copy(launchNormal).addScaledVector(eastVec, 0.45).normalize();

    launchRocketMat.opacity = 1;
    launchFlameMat.opacity = 1;
    launchExhMat.opacity = 0.5;
    launchExhHistory.length = 0;
  }

  return {
    update(time: number) {
      // 1. Shuttle
      const orbitSpeed = 0.0003;
      const angle = time * orbitSpeed;
      const rXZ = 1.8,
        rY = 0.6;
      const sx = Math.cos(angle) * rXZ;
      const sy = Math.sin(angle * 0.7) * rY + 0.3;
      const sz = Math.sin(angle) * rXZ;
      shuttleGroup.position.set(sx, sy, sz);

      const na = angle + 0.015;
      shuttleGroup.lookAt(Math.cos(na) * rXZ, Math.sin(na * 0.7) * rY + 0.3, Math.sin(na) * rXZ);
      engineMat.opacity = 0.5 + 0.3 * Math.sin(time * 0.015);

      exhaustHistory.unshift(new THREE.Vector3(sx, sy, sz));
      if (exhaustHistory.length > exhaustCount) exhaustHistory.pop();
      for (let i = 0; i < exhaustCount; i++) {
        if (i < exhaustHistory.length) {
          exhaustPos[i * 3] = exhaustHistory[i].x;
          exhaustPos[i * 3 + 1] = exhaustHistory[i].y;
          exhaustPos[i * 3 + 2] = exhaustHistory[i].z;
        }
      }
      exhaustGeo.attributes.position.needsUpdate = true;

      // 2. ISS
      const issAngle = time * 0.00022 + 2.1;
      const issRXZ = 1.88,
        issRY = 0.28;
      const isx = Math.cos(issAngle) * issRXZ;
      const isy = Math.sin(issAngle * 1.3) * issRY + 0.08;
      const isz = Math.sin(issAngle) * issRXZ;
      issGroup.position.set(isx, isy, isz);
      const issNa = issAngle + 0.01;
      issGroup.lookAt(Math.cos(issNa) * issRXZ, Math.sin(issNa * 1.3) * issRY + 0.08, Math.sin(issNa) * issRXZ);
      issGroup.rotateZ(Math.PI / 2);

      // 4. Space Launch
      if (launchState === 'idle') {
        launchTimer -= 16.67;
        if (launchTimer <= 0) triggerLaunch();
      } else {
        if (launchState === 'ignition') {
          launchProgress += 0.02;
          const jitter = (Math.random() - 0.5) * 0.008;
          launchGroup.position.copy(launchPos).addScalar(jitter);
          launchGroup.lookAt(launchPos.clone().add(launchNormal));
          launchFlameMat.opacity = 0.4 + 0.6 * Math.random();

          if (Math.random() > 0.5) {
            launchExhHistory.unshift(launchPos.clone().addScaledVector(launchNormal, -0.02));
          }
          if (launchProgress >= 1.0) {
            launchState = 'ascent';
            launchProgress = 0;
          }
        } else if (launchState === 'ascent') {
          launchProgress += 0.006;
          const curRadius = 1.02 + 0.7 * Math.sin((launchProgress * Math.PI) / 2);
          const currentVec = new THREE.Vector3().lerpVectors(launchNormal, orbitNormal, launchProgress).normalize();
          const altPos = launchPos.clone().normalize().multiplyScalar(curRadius);
          launchGroup.position.copy(altPos);

          const tangent = currentVec.clone().multiplyScalar(10).add(altPos);
          launchGroup.lookAt(tangent);
          launchFlameMat.opacity = 0.7 + 0.3 * Math.sin(time * 0.08);

          launchExhHistory.unshift(altPos.clone());
          if (launchExhHistory.length > launchExhCount) launchExhHistory.pop();

          if (launchProgress >= 1.0) {
            launchState = 'orbit';
            launchProgress = 0;
          }
        } else if (launchState === 'orbit') {
          launchProgress += 0.004;
          const curRadius = 1.72;
          const orbitAngle = launchProgress * Math.PI * 1.5;
          const normalRot = new THREE.Vector3().crossVectors(launchNormal, orbitNormal).normalize();
          const oPos = launchNormal.clone().applyAxisAngle(normalRot, orbitAngle).multiplyScalar(curRadius);
          launchGroup.position.copy(oPos);

          const oNext = launchNormal.clone().applyAxisAngle(normalRot, orbitAngle + 0.05).multiplyScalar(curRadius);
          launchGroup.lookAt(oNext);
          launchFlameMat.opacity = Math.max(0, launchFlameMat.opacity - 0.05);

          if (Math.random() > 0.4 && launchFlameMat.opacity > 0.1) {
            launchExhHistory.unshift(oPos.clone());
          }
          if (launchExhHistory.length > 0 && Math.random() > 0.5) {
            launchExhHistory.pop();
          }

          if (launchProgress >= 1.0) {
            launchState = 'fade';
            launchProgress = 0;
          }
        } else if (launchState === 'fade') {
          launchProgress += 0.02;
          launchRocketMat.opacity = 1 - launchProgress;
          launchFlameMat.opacity = 0;
          launchExhMat.opacity = 0.5 * (1 - launchProgress);
          if (launchProgress >= 1.0) {
            launchState = 'idle';
            launchTimer = 22000 + Math.random() * 15000;
          }
        }

        for (let i = 0; i < launchExhCount; i++) {
          if (i < launchExhHistory.length) {
            const driftIdx = i * 3;
            launchExhPos[driftIdx] = launchExhHistory[i].x + (Math.random() - 0.5) * 0.02;
            launchExhPos[driftIdx + 1] = launchExhHistory[i].y + (Math.random() - 0.5) * 0.02;
            launchExhPos[driftIdx + 2] = launchExhHistory[i].z + (Math.random() - 0.5) * 0.02;
          }
        }
        launchExhGeo.attributes.position.needsUpdate = true;
      }
    },
    destroy() {
      scene.remove(shuttleGroup);
      scene.remove(exhaustPoints);
      scene.remove(issGroup);
      scene.remove(launchGroup);
      scene.remove(launchPoints);
      exhaustGeo.dispose();
      exhaustMat.dispose();
      launchExhGeo.dispose();
      launchExhMat.dispose();
    },
  };
}

// ============================================================================
// 5. SATELLITES & DEEP SPACE PROBES MODULE
// ============================================================================
export function createSatellites(ctx: GlobeContext): GlobeModule {
  const { globeGroup, isMobile } = ctx;

  const DEFS_ALL = [
    { radius: 1.35, speed: 0.0007, inclination: 0.4, phaseOffset: 0 },
    { radius: 1.5, speed: 0.0005, inclination: -0.6, phaseOffset: Math.PI * 0.7 },
    { radius: 1.6, speed: 0.00045, inclination: 0.9, phaseOffset: Math.PI * 1.4 },
  ];
  const DEFS = isMobile ? DEFS_ALL.slice(0, 1) : DEFS_ALL;

  const satellites = DEFS.map((def) => {
    const satGroup = new THREE.Group();
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0xbbbbbb, transparent: true, opacity: 0.8 });
    satGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.015, 0.015), bodyMat));

    const panelMat = new THREE.MeshBasicMaterial({
      color: 0x3355aa,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    });
    const panelGeo = new THREE.PlaneGeometry(0.038, 0.012);
    const pL = new THREE.Mesh(panelGeo, panelMat);
    pL.position.set(0, 0, 0.02);
    satGroup.add(pL);
    const pR = new THREE.Mesh(panelGeo, panelMat);
    pR.position.set(0, 0, -0.02);
    satGroup.add(pR);

    const antennaMat = new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.6 });
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.001, 0.02, 4), antennaMat);
    antenna.position.y = 0.015;
    satGroup.add(antenna);

    globeGroup.add(satGroup);
    return { group: satGroup, def };
  });

  // Deep Space Probe (Voyager style)
  const probeGroup = new THREE.Group();
  const goldMat = new THREE.MeshBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.85 });
  const greyMat = new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.8 });
  const dishMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.9, side: THREE.DoubleSide });

  const probeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.035, 6), goldMat);
  probeBody.rotation.z = Math.PI / 2;
  probeGroup.add(probeBody);

  const probeDish = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.018, 12, 1, true), dishMat);
  probeDish.rotation.z = -Math.PI / 2;
  probeDish.position.x = 0.025;
  probeGroup.add(probeDish);

  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.09, 4), greyMat);
  boom.position.set(-0.015, -0.025, 0);
  boom.rotation.z = 0.6;
  probeGroup.add(boom);
  globeGroup.add(probeGroup);

  // Low-Orbit Drone (Quadcopter)
  const droneGroup = new THREE.Group();
  const droneBodyMat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.88 });
  const beaconRed = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.9 });
  const beaconBlue = new THREE.MeshBasicMaterial({ color: 0x0088ff, transparent: true, opacity: 0.9 });

  const droneHub = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.01, 8), droneBodyMat);
  droneGroup.add(droneHub);

  const armMat = new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.8 });
  const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.003, 0.003), armMat);
  arm1.rotation.y = Math.PI / 4;
  droneGroup.add(arm1);
  const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.003, 0.003), armMat);
  arm2.rotation.y = -Math.PI / 4;
  droneGroup.add(arm2);

  const bRed = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 6), beaconRed);
  bRed.position.set(0.018, 0.006, 0.018);
  droneGroup.add(bRed);
  const bBlue = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 6), beaconBlue);
  bBlue.position.set(-0.018, 0.006, -0.018);
  droneGroup.add(bBlue);
  globeGroup.add(droneGroup);

  // UFO
  const ufoGroup = new THREE.Group();
  const saucerMat = new THREE.MeshBasicMaterial({ color: 0x778899, transparent: true, opacity: 0.9 });
  const domeMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.9 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.9 });

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 8), saucerMat);
  ufoGroup.add(disc);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    domeMat
  );
  dome.position.y = 0.005;
  ufoGroup.add(dome);

  const rimLights: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const rimLight = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 6), lightMat);
    rimLight.position.set(Math.cos(angle) * 0.038, -0.002, Math.sin(angle) * 0.038);
    ufoGroup.add(rimLight);
    rimLights.push(rimLight);
  }
  globeGroup.add(ufoGroup);

  return {
    update(time: number) {
      satellites.forEach((sat) => {
        const angle = time * sat.def.speed + sat.def.phaseOffset;
        const r = sat.def.radius,
          inc = sat.def.inclination;
        sat.group.position.set(
          Math.cos(angle) * r,
          Math.sin(angle) * Math.sin(inc) * r,
          Math.sin(angle) * Math.cos(inc) * r
        );
        const na = angle + 0.02;
        sat.group.lookAt(
          Math.cos(na) * r,
          Math.sin(na) * Math.sin(inc) * r,
          Math.sin(na) * Math.cos(inc) * r
        );
      });

      const probeAngle = time * 0.00028 + 1.5;
      const pr = 2.1;
      probeGroup.position.set(
        Math.cos(probeAngle) * pr,
        Math.sin(probeAngle * 0.4) * 0.5 + 0.4,
        Math.sin(probeAngle) * pr
      );
      probeGroup.lookAt(0, 0, 0);
      probeGroup.rotateY(Math.PI);

      const droneAngle = time * 0.00065;
      const dr = 1.16;
      droneGroup.position.set(
        Math.cos(droneAngle) * dr,
        Math.sin(droneAngle * 0.9) * 0.2,
        Math.sin(droneAngle) * dr
      );
      const dna = droneAngle + 0.02;
      droneGroup.lookAt(Math.cos(dna) * dr, Math.sin(dna * 0.9) * 0.2, Math.sin(dna) * dr);

      const blink = Math.sin(time * 0.01) > 0;
      beaconRed.opacity = blink ? 0.9 : 0.15;
      beaconBlue.opacity = blink ? 0.15 : 0.9;

      const ufoAngle = time * 0.0011 + 3.0;
      const ur = 1.62 + Math.sin(time * 0.015) * 0.16;
      const jitterX = Math.sin(time * 0.06) * 0.015;
      const jitterY = Math.cos(time * 0.05) * 0.015;
      const jitterZ = Math.sin(time * 0.07) * 0.015;
      ufoGroup.position.set(
        Math.cos(ufoAngle) * ur + jitterX,
        Math.sin(ufoAngle * 1.5) * 0.4 + jitterY,
        Math.sin(ufoAngle) * ur + jitterZ
      );
      ufoGroup.rotation.y = time * 0.015;
      ufoGroup.rotation.x = Math.sin(time * 0.04) * 0.25;

      rimLights.forEach((rl, idx) => {
        const lightBlink = Math.sin(time * 0.025 + (idx * Math.PI) / 2) > 0;
        (rl.material as THREE.Material).opacity = lightBlink ? 0.95 : 0.15;
      });
      domeMat.opacity = 0.5 + 0.4 * Math.sin(time * 0.02);
    },
    destroy() {
      satellites.forEach((sat) => globeGroup.remove(sat.group));
      globeGroup.remove(probeGroup);
      globeGroup.remove(droneGroup);
      globeGroup.remove(ufoGroup);
    },
  };
}

// ============================================================================
// 6. COMETS MODULE
// ============================================================================
export function createComets(ctx: GlobeContext): GlobeModule {
  const { universeGroup, isMobile } = ctx;
  const POOL_SIZE = isMobile ? 1 : 2;
  const comets: any[] = [];

  for (let i = 0; i < POOL_SIZE; i++) {
    const headMat = new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), headMat);
    universeGroup.add(head);

    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x6699cc,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), glowMat);
    universeGroup.add(glow);

    const tailCount = isMobile ? 16 : 40;
    const tailPos = new Float32Array(tailCount * 3);
    const tailGeo = new THREE.BufferGeometry();
    tailGeo.setAttribute('position', new THREE.BufferAttribute(tailPos, 3));
    const tailMat = new THREE.PointsMaterial({
      color: 0x88bbee,
      size: 0.025,
      transparent: true,
      opacity: 0,
      sizeAttenuation: true,
    });
    const tailPoints = new THREE.Points(tailGeo, tailMat);
    universeGroup.add(tailPoints);

    comets.push({
      head,
      headMat,
      glow,
      glowMat,
      tailPoints,
      tailGeo,
      tailMat,
      tailHistory: [],
      active: false,
      life: 0,
      maxLife: 0,
      pos: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      speed: 0,
    });
  }

  let nextSpawn = 15000;

  return {
    update() {
      nextSpawn -= 16.67;
      if (nextSpawn <= 0) {
        const comet = comets.find((c) => !c.active);
        if (comet) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const r = 10 + Math.random() * 6;
          comet.pos.set(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.sin(phi) * Math.sin(theta),
            r * Math.cos(phi)
          );
          comet.direction
            .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
            .normalize();
          comet.speed = 0.03 + Math.random() * 0.02;
          comet.life = 0;
          comet.maxLife = 300 + Math.random() * 200;
          comet.active = true;
          comet.tailHistory = [];
        }
        nextSpawn = 30000 + Math.random() * 30000;
      }

      comets.forEach((comet) => {
        if (!comet.active) return;
        comet.life++;
        comet.pos.addScaledVector(comet.direction, comet.speed);
        comet.head.position.copy(comet.pos);
        comet.glow.position.copy(comet.pos);

        let alpha = 1;
        if (comet.life < 40) alpha = comet.life / 40;
        else if (comet.life > comet.maxLife - 60) alpha = (comet.maxLife - comet.life) / 60;

        comet.headMat.opacity = 0.8 * alpha;
        comet.glowMat.opacity = 0.12 * alpha;
        comet.tailMat.opacity = 0.35 * alpha;

        comet.tailHistory.unshift(comet.pos.clone());
        if (comet.tailHistory.length > 40) comet.tailHistory.pop();
        const tArr = comet.tailGeo.attributes.position.array;
        for (let i = 0; i < 40; i++) {
          if (i < comet.tailHistory.length) {
            tArr[i * 3] = comet.tailHistory[i].x;
            tArr[i * 3 + 1] = comet.tailHistory[i].y;
            tArr[i * 3 + 2] = comet.tailHistory[i].z;
          }
        }
        comet.tailGeo.attributes.position.needsUpdate = true;

        if (comet.life >= comet.maxLife) {
          comet.active = false;
          comet.headMat.opacity = 0;
          comet.glowMat.opacity = 0;
          comet.tailMat.opacity = 0;
        }
      });
    },
    destroy() {
      comets.forEach((c) => {
        universeGroup.remove(c.head);
        universeGroup.remove(c.glow);
        universeGroup.remove(c.tailPoints);
        c.head.geometry.dispose();
        c.headMat.dispose();
        c.glow.geometry.dispose();
        c.glowMat.dispose();
        c.tailGeo.dispose();
        c.tailMat.dispose();
      });
    },
  };
}

// ============================================================================
// 7. SHOOTING STARS MODULE
// ============================================================================
export function createShootingStars(ctx: GlobeContext): GlobeModule {
  const { universeGroup, isMobile } = ctx;
  const POOL_SIZE = isMobile ? 1 : 3;
  const shootingStars: any[] = [];

  for (let i = 0; i < POOL_SIZE; i++) {
    const ssGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    ]);
    const ssMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const ssLine = new THREE.Line(ssGeo, ssMat);
    universeGroup.add(ssLine);
    shootingStars.push({
      line: ssLine,
      geo: ssGeo,
      mat: ssMat,
      active: false,
      life: 0,
      maxLife: 0,
      startPos: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      speed: 0,
      trailLength: 0,
    });
  }

  let nextSpawn = 3000;

  return {
    update() {
      nextSpawn -= 16.67;
      if (nextSpawn <= 0) {
        const ss = shootingStars.find((s) => !s.active);
        if (ss) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const r = 12 + Math.random() * 8;
          ss.startPos.set(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.sin(phi) * Math.sin(theta),
            r * Math.cos(phi)
          );
          ss.direction
            .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
            .normalize();
          ss.speed = 0.15 + Math.random() * 0.15;
          ss.trailLength = 1.5 + Math.random() * 1.5;
          ss.life = 0;
          ss.maxLife = 40 + Math.random() * 30;
          ss.active = true;
          ss.mat.opacity = 0.9;
        }
        nextSpawn = 8000 + Math.random() * 6000;
      }

      shootingStars.forEach((ss) => {
        if (!ss.active) return;
        ss.life++;
        const headPos = ss.startPos.clone().addScaledVector(ss.direction, ss.life * ss.speed);
        const tailPos = headPos.clone().addScaledVector(ss.direction, -ss.trailLength);
        const arr = ss.geo.attributes.position.array;
        arr[0] = headPos.x;
        arr[1] = headPos.y;
        arr[2] = headPos.z;
        arr[3] = tailPos.x;
        arr[4] = tailPos.y;
        arr[5] = tailPos.z;
        ss.geo.attributes.position.needsUpdate = true;
        const fadeStart = ss.maxLife * 0.7;
        ss.mat.opacity =
          ss.life > fadeStart ? 0.9 * (1 - (ss.life - fadeStart) / (ss.maxLife - fadeStart)) : 0.9;
        if (ss.life >= ss.maxLife) {
          ss.active = false;
          ss.mat.opacity = 0;
        }
      });
    },
    destroy() {
      shootingStars.forEach((ss) => {
        universeGroup.remove(ss.line);
        ss.geo.dispose();
        ss.mat.dispose();
      });
    },
  };
}

// ============================================================================
// 8. GALAXIES & MILKY WAY MODULE
// ============================================================================
function makeGalaxyTexture(w: number, h: number, coreColor: string, armColor: string, spiralArms: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const cx = w / 2,
    cy = h / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) / 2);
  grad.addColorStop(0, coreColor);
  grad.addColorStop(0.3, armColor);
  grad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, h / w);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  if (spiralArms > 0) {
    for (let arm = 0; arm < spiralArms; arm++) {
      const baseAngle = (arm / spiralArms) * Math.PI * 2;
      for (let j = 0; j < 80; j++) {
        const dist = 5 + j * (Math.min(w, h) * 0.005);
        const angle = baseAngle + dist * 0.04;
        const spread = 3 + dist * 0.15;
        const x = cx + Math.cos(angle) * dist + (Math.random() - 0.5) * spread;
        const y = cy + Math.sin(angle) * dist * (h / w) + (Math.random() - 0.5) * spread;
        const alpha = Math.max(0, 0.6 - j * 0.007);
        ctx.fillStyle = `rgba(200, 220, 255, ${alpha})`;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }
  }
  return new THREE.CanvasTexture(c);
}

function makeLunaGalaxyTexture() {
  const w = 256,
    h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return new THREE.Texture();

  function lobe(cx: number, cy: number, rx: number, ry: number, core: string, edge: string) {
    if (!ctx) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, core);
    g.addColorStop(0.55, edge);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  lobe(118, 150, 58, 34, 'rgba(235,205,255,0.65)', 'rgba(175,140,255,0.20)');
  lobe(174, 103, 30, 27, 'rgba(240,215,255,0.70)', 'rgba(180,148,255,0.22)');
  lobe(188, 74, 10, 19, 'rgba(230,200,255,0.60)', 'rgba(170,135,255,0.15)');
  lobe(204, 116, 14, 10, 'rgba(235,210,255,0.55)', 'rgba(175,142,255,0.12)');
  lobe(210, 135, 11, 28, 'rgba(220,190,255,0.50)', 'rgba(162,128,255,0.12)');
  lobe(224, 112, 8, 16, 'rgba(212,182,255,0.42)', 'rgba(155,120,255,0.10)');
  lobe(96, 180, 11, 20, 'rgba(228,198,255,0.50)', 'rgba(168,135,255,0.12)');
  lobe(118, 184, 10, 18, 'rgba(228,198,255,0.50)', 'rgba(168,135,255,0.12)');
  lobe(148, 182, 10, 20, 'rgba(225,196,255,0.50)', 'rgba(165,133,255,0.12)');
  lobe(168, 176, 9, 16, 'rgba(222,193,255,0.45)', 'rgba(162,130,255,0.10)');

  for (let i = 0; i < 90; i++) {
    const x = 55 + Math.random() * 165;
    const y = 55 + Math.random() * 165;
    const a = 0.25 + Math.random() * 0.55;
    const s = 0.6 + Math.random() * 1.4;
    ctx.fillStyle = `rgba(245, 228, 255, ${a})`;
    ctx.fillRect(x, y, s, s);
  }
  return new THREE.CanvasTexture(c);
}

function makeMilkyWayTexture() {
  const w = 1024,
    h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return new THREE.Texture();

  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * w;
    const yOffset = (Math.random() + Math.random() + Math.random()) / 3 - 0.5;
    const y = h / 2 + yOffset * h * 0.8;
    const brightness = 150 + Math.random() * 105;
    const alpha = 0.1 + Math.random() * 0.5;
    const size = 0.5 + Math.random() * 1.5;
    ctx.fillStyle = `rgba(${brightness}, ${brightness + 10}, ${brightness + 30}, ${alpha})`;
    ctx.fillRect(x, y, size, size);
  }

  for (let i = 0; i < 12; i++) {
    const x = Math.random() * w;
    const y = h / 2 + (Math.random() - 0.5) * h * 0.4;
    const r = 20 + Math.random() * 40;
    const hue = Math.random() > 0.5 ? '180, 200, 255' : '255, 180, 200';
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${hue}, 0.08)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return new THREE.CanvasTexture(c);
}

export function createGalaxies(ctx: GlobeContext): GlobeModule {
  const { universeGroup, isMobile } = ctx;
  const sprites: any[] = [];

  // Andromeda
  const andromedaTex = makeGalaxyTexture(256, 128, 'rgba(255,240,200,0.5)', 'rgba(150,170,220,0.15)', 3);
  const andromedaMat = new THREE.SpriteMaterial({
    map: andromedaTex,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const andromeda = new THREE.Sprite(andromedaMat);
  andromeda.position.copy(sphericalToVec3(1.1, 0.6, 28));
  andromeda.scale.set(6, 3, 1);
  andromeda.material.rotation = 0.4;
  universeGroup.add(andromeda);
  sprites.push({ sprite: andromeda, mat: andromedaMat, tex: andromedaTex, baseOpacity: 0.35 });

  // Triangulum
  const triangulumTex = makeGalaxyTexture(128, 96, 'rgba(220,230,255,0.4)', 'rgba(120,140,200,0.1)', 2);
  const triangulumMat = new THREE.SpriteMaterial({
    map: triangulumTex,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  const triangulum = new THREE.Sprite(triangulumMat);
  triangulum.position.copy(sphericalToVec3(1.6, 0.75, 32));
  triangulum.scale.set(3.5, 2.5, 1);
  triangulum.material.rotation = -0.3;
  universeGroup.add(triangulum);
  sprites.push({ sprite: triangulum, mat: triangulumMat, tex: triangulumTex, baseOpacity: 0.2 });

  // Luna dog galaxy
  const lunaGalaxyTex = makeLunaGalaxyTexture();
  const lunaGalaxyMat = new THREE.SpriteMaterial({
    map: lunaGalaxyTex,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const lunaGalaxy = new THREE.Sprite(lunaGalaxyMat);
  lunaGalaxy.position.copy(sphericalToVec3(4.9, 1.5, 28));
  lunaGalaxy.scale.set(4.5, 4.5, 1);
  lunaGalaxy.material.rotation = 0.2;
  universeGroup.add(lunaGalaxy);
  sprites.push({ sprite: lunaGalaxy, mat: lunaGalaxyMat, tex: lunaGalaxyTex, baseOpacity: 0.38 });

  // Milky Way Band
  const milkyWaySprites: any[] = [];
  const mwTex = makeMilkyWayTexture();
  const mwSegments = isMobile ? 6 : 12;
  const mwRadius = 35;
  for (let i = 0; i < mwSegments; i++) {
    const frac = i / mwSegments;
    const theta = frac * Math.PI * 1.5 + 0.5;
    const phi = 1.2 + 0.3 * Math.sin(frac * Math.PI * 2);
    const pos = sphericalToVec3(theta, phi, mwRadius);
    const centerDist = Math.abs(frac - 0.5) * 2;
    const tintR = 1.0 - centerDist * 0.08;
    const tintG = 1.0 - centerDist * 0.03;
    const tintB = 0.92 + centerDist * 0.08;
    const mat = new THREE.SpriteMaterial({
      map: mwTex,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      color: new THREE.Color(tintR, tintG, tintB),
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.set(12, 1.8, 1);
    sprite.material.rotation = -theta + Math.PI / 2;
    universeGroup.add(sprite);
    milkyWaySprites.push({ sprite, mat, baseOpacity: 0.11 });
  }

  return {
    update(time: number) {
      sprites.forEach((s, i) => {
        const pulse = 0.9 + 0.1 * Math.sin(time * 0.0008 + i * 2.1);
        s.mat.opacity = s.baseOpacity * pulse;
      });
      milkyWaySprites.forEach((s, i) => {
        const pulse = 0.85 + 0.15 * Math.sin(time * 0.0005 + i * 0.8);
        s.mat.opacity = s.baseOpacity * pulse;
      });
    },
    updateColors() {
      const light = isLight();
      const factor = light ? 0.3 : 1;
      sprites.forEach((s) => {
        s.mat.opacity = s.baseOpacity * factor;
      });
      milkyWaySprites.forEach((s) => {
        s.mat.opacity = s.baseOpacity * factor;
      });
    },
    destroy() {
      sprites.forEach((s) => {
        universeGroup.remove(s.sprite);
        s.mat.dispose();
        s.tex.dispose();
      });
      milkyWaySprites.forEach((s) => {
        universeGroup.remove(s.sprite);
        s.mat.dispose();
      });
      mwTex.dispose();
    },
  };
}
