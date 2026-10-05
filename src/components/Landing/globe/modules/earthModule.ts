import * as THREE from 'three';
import { azerbaijanOutline, nakhchivanOutline } from '../data/azerbaijan.js';
import { continentOutlines } from '../data/continents.js';
import { michiganOutline } from '../data/michigan.js';
import { GLOBE_LOCATIONS, GlobeContext, GlobeModule, latLonToVec3 } from '../globeTypes';

const LAND_MASK_WIDTH = 1024;
const LAND_MASK_HEIGHT = 512;

function unwrapOutline(outline: number[][]) {
  let offset = 0;
  return outline.map(([lon, lat], i) => {
    if (i) {
      const prevLon = outline[i - 1][0] + offset;
      const delta = lon + offset - prevLon;
      if (delta > 180) offset -= 360;
      if (delta < -180) offset += 360;
    }
    return [lon + offset, lat];
  });
}

function drawGeoPath(ctx2d: CanvasRenderingContext2D, outline: number[][], lonOffset = 0) {
  ctx2d.beginPath();
  outline.forEach(([lon, lat], i) => {
    const x = ((lon + lonOffset + 180) / 360) * LAND_MASK_WIDTH;
    const y = ((90 - lat) / 180) * LAND_MASK_HEIGHT;
    if (i) ctx2d.lineTo(x, y);
    else ctx2d.moveTo(x, y);
  });
  ctx2d.closePath();
}

function createLandMaskTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = LAND_MASK_WIDTH;
  canvas.height = LAND_MASK_HEIGHT;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return null;

  ctx2d.fillStyle = '#000';
  ctx2d.fillRect(0, 0, LAND_MASK_WIDTH, LAND_MASK_HEIGHT);
  ctx2d.lineJoin = 'round';
  ctx2d.lineCap = 'round';

  for (const rawOutline of continentOutlines) {
    const outline = unwrapOutline(rawOutline);
    for (const lonOffset of [-360, 0, 360]) {
      drawGeoPath(ctx2d, outline, lonOffset);
      ctx2d.strokeStyle = 'rgba(255,255,255,0.34)';
      ctx2d.lineWidth = 8;
      ctx2d.stroke();
    }
  }

  for (const rawOutline of continentOutlines) {
    const outline = unwrapOutline(rawOutline);
    for (const lonOffset of [-360, 0, 360]) {
      drawGeoPath(ctx2d, outline, lonOffset);
      ctx2d.fillStyle = '#fff';
      ctx2d.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function createEarth(ctx: GlobeContext): GlobeModule {
  const { globeGroup, t } = ctx;
  const accent = t.accent || 0x00cc88;
  const landMaskTexture = createLandMaskTexture();

  // Wireframe sphere
  const sphereGeo = new THREE.SphereGeometry(1, 48, 48);
  const wireMat = new THREE.MeshBasicMaterial({
    color: t.globeColor,
    wireframe: true,
    transparent: true,
    opacity: 0.05,
  });
  globeGroup.add(new THREE.Mesh(sphereGeo, wireMat));

  // Data-driven Earth shader: Natural Earth land mask + procedural detail
  const earthVert = /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vPos;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPos = normal;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const earthFrag = /* glsl */ `
    precision highp float;
    uniform float uTime;
    uniform vec3 uOceanDeep;
    uniform vec3 uOceanShallow;
    uniform vec3 uLand;
    uniform vec3 uHighland;
    uniform vec3 uSnow;
    uniform vec3 uAccent;
    uniform float uAccentMix;
    uniform sampler2D uLandMask;
    varying vec3 vNormal;
    varying vec3 vPos;

    const float PI = 3.141592653589793;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float vnoise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float n000 = hash(i + vec3(0,0,0));
      float n100 = hash(i + vec3(1,0,0));
      float n010 = hash(i + vec3(0,1,0));
      float n110 = hash(i + vec3(1,1,0));
      float n001 = hash(i + vec3(0,0,1));
      float n101 = hash(i + vec3(1,0,1));
      float n011 = hash(i + vec3(0,1,1));
      float n111 = hash(i + vec3(1,1,1));
      return mix(
        mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
        mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
        f.z
      );
    }
    float fbm(vec3 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 5; i++) {
        v += a * vnoise(p);
        p *= 2.03;
        a *= 0.5;
      }
      return v;
    }
    float fbmHF(vec3 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 3; i++) {
        v += a * vnoise(p);
        p *= 2.4;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec3 n = normalize(vPos);
      float lon = atan(-n.z, n.x);
      float latRad = asin(clamp(n.y, -1.0, 1.0));
      vec2 geoUv = vec2(fract(lon / (2.0 * PI) + 0.5), latRad / PI + 0.5);
      float mask = texture2D(uLandMask, geoUv).r;
      float land = smoothstep(0.52, 0.72, mask);
      float shelf = smoothstep(0.06, 0.42, mask) * (1.0 - land);
      float coast = smoothstep(0.28, 0.58, mask) * (1.0 - smoothstep(0.74, 0.96, mask));

      float terrain = fbm(n * 7.0 + vec3(3.0, 5.0, 2.0));
      float ridges = fbm(n * 22.0 + vec3(11.0, 2.0, 8.0));
      float microTopo = fbmHF(n * 38.0 + vec3(5.5, 13.0, 2.7));
      float elev = terrain * 0.60 + ridges * 0.28 + (microTopo - 0.5) * 0.12;

      float lat = abs(n.y);

      float swell = fbm(n * 8.0 + vec3(uTime * 0.045, uTime * 0.025, 0.0));
      float swell2 = fbm(n * 20.0 + vec3(-uTime * 0.075, uTime * 0.06, uTime * 0.03));
      float current = 0.5 + 0.5 * sin(lon * 7.0 + latRad * 4.0 + uTime * 0.35);
      float waves = swell * 0.55 + swell2 * 0.35 + current * 0.1;

      vec3 ocean = mix(uOceanDeep, uOceanShallow, clamp(shelf * 0.95 + waves * 0.08, 0.0, 1.0));
      ocean += vec3(waves * 0.045 + coast * 0.04);

      float dry = fbm(n * 4.0 + vec3(8.0, 1.0, 4.0));
      float moisture = 1.0 - dry;

      vec3 lowlandCol = mix(uLand * 0.85, uLand, moisture * 0.8);
      vec3 uplandsCol = mix(uLand, uHighland, smoothstep(0.3, 0.65, dry) * 0.55);
      vec3 highlandCol = uHighland + vec3(ridges * 0.04, ridges * 0.03, 0.0);
      vec3 mountainCol = mix(uHighland * 0.88, uSnow * 0.45 + uHighland * 0.55, smoothstep(0.60, 0.84, ridges));
      vec3 peakCol = mix(uHighland * 0.82, uSnow, 0.68);

      vec3 landCol = lowlandCol;
      landCol = mix(landCol, uplandsCol,  smoothstep(0.36, 0.50, elev));
      landCol = mix(landCol, highlandCol, smoothstep(0.50, 0.62, elev));
      landCol = mix(landCol, mountainCol, smoothstep(0.62, 0.74, elev));
      landCol = mix(landCol, peakCol,     smoothstep(0.74, 0.85, elev));

      float ridgeShadow = ridges * smoothstep(0.34, 0.68, elev) * (1.0 - smoothstep(0.74, 0.88, elev));
      landCol *= 1.0 - ridgeShadow * 0.22;

      float desert = smoothstep(0.60, 0.88, dry) * (1.0 - smoothstep(0.18, 0.52, lat)) * smoothstep(0.30, 0.55, land);
      landCol = mix(landCol, uHighland * 1.08 * vec3(1.06, 0.96, 0.82), desert * 0.38);

      float snowAlt  = smoothstep(0.80, 0.94, elev) * smoothstep(0.10, 0.80, lat);
      float snowPole = smoothstep(0.72, 0.90, lat);
      float snow = max(snowAlt, snowPole * 0.55);
      landCol = mix(landCol, uSnow, snow);

      vec3 col = mix(ocean, landCol, land);
      col = mix(col, mix(uOceanShallow, uAccent, 0.22), coast * 0.38);

      float ice = smoothstep(0.75, 0.92, lat);
      col = mix(col, uSnow, ice * (0.22 + land * 0.34));

      vec3 lightDir = normalize(vec3(0.4, 0.5, 1.0));
      float diff = max(dot(vNormal, lightDir), 0.0);
      float ambient = 0.55;
      col *= (ambient + diff * 0.55);

      col = mix(col, uAccent, uAccentMix);
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const earthUniforms = {
    uTime: { value: 0 },
    uOceanDeep: { value: new THREE.Color(0x0a1f4a) },
    uOceanShallow: { value: new THREE.Color(0x1e6fbf) },
    uLand: { value: new THREE.Color(0x2d5a3d) },
    uHighland: { value: new THREE.Color(0x8a7a5c) },
    uSnow: { value: new THREE.Color(0xf0f4f8) },
    uAccent: { value: new THREE.Color(accent) },
    uAccentMix: { value: 0.04 },
    uLandMask: { value: landMaskTexture },
  };

  const earthMat = new THREE.ShaderMaterial({
    uniforms: earthUniforms,
    vertexShader: earthVert,
    fragmentShader: earthFrag,
  });
  const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(0.995, 96, 96), earthMat);
  globeGroup.add(earthMesh);

  // Lat/lon grid
  const gridMat = new THREE.LineBasicMaterial({
    color: t.globeColor,
    transparent: true,
    opacity: 0.18,
  });
  for (let lat = -75; lat <= 75; lat += 15) {
    const pts: any[] = [];
    for (let lon = 0; lon <= 360; lon += 3) pts.push(latLonToVec3(lat, lon - 180, 1.001, THREE));
    globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  }
  for (let lon = 0; lon < 360; lon += 15) {
    const pts: any[] = [];
    for (let lat = -90; lat <= 90; lat += 3) pts.push(latLonToVec3(lat, lon, 1.001, THREE));
    globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  }

  // Continent outlines
  const continentMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.42,
  });
  continentOutlines.forEach((outline: number[][]) => {
    const pts = [...outline, outline[0]].map(([lon, lat]) => latLonToVec3(lat, lon, 1.013, THREE));
    globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), continentMat));
  });

  // --- Home-region highlights (outline + soft fill + glow halo) ---------------
  const highlightMats: { fill: any; glow: any; base: number }[] = [];

  function outlineRing(outline: number[][]) {
    const pts = outline.slice();
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) pts.pop();
    return pts;
  }

  function addRegion(outline: number[][], colorHex: number, fillOpacity: number) {
    const ring = outlineRing(outline);
    // Filled polygon: triangulate in lon/lat, then lift each vertex onto the sphere
    const contour = ring.map(([lon, lat]) => new THREE.Vector2(lon, lat));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    const positions = new Float32Array(ring.length * 3);
    ring.forEach(([lon, lat], k) => {
      const v = latLonToVec3(lat, lon, 1.007, THREE);
      positions[k * 3] = v.x;
      positions[k * 3 + 1] = v.y;
      positions[k * 3 + 2] = v.z;
    });
    const index: number[] = [];
    faces.forEach((f: number[]) => index.push(f[0], f[1], f[2]));
    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    fillGeo.setIndex(index);
    const fillMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: fillOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    globeGroup.add(new THREE.Mesh(fillGeo, fillMat));

    // Crisp border + a slightly lifted additive copy for a glow halo
    const linePts = ring.map(([lon, lat]) => latLonToVec3(lat, lon, 1.015, THREE));
    linePts.push(linePts[0]);
    const lineMat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95 });
    globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), lineMat));
    const glowPts = ring.map(([lon, lat]) => latLonToVec3(lat, lon, 1.02, THREE));
    glowPts.push(glowPts[0]);
    const glowMat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(glowPts), glowMat));
    highlightMats.push({ fill: fillMat, glow: glowMat, base: fillOpacity });
  }

  // Azerbaijan (mainland + Nakhchivan exclave)
  addRegion(azerbaijanOutline, 0x38bdf8, 0.26);
  addRegion(nakhchivanOutline, 0x38bdf8, 0.26);

  // Michigan (both peninsulas), same treatment in amber
  addRegion(michiganOutline.lowerPeninsula, 0xf59e0b, 0.22);
  addRegion(michiganOutline.upperPeninsula, 0xf59e0b, 0.22);

  // Caucasus: Greater Caucasus ridge from the Black Sea to the Absheron Peninsula,
  // plus a dashed ring framing the region between the Black and Caspian seas.
  const caucasusRidge = [
    [37.4, 44.95], [38.6, 44.35], [39.8, 43.75], [41.0, 43.4], [42.2, 43.2],
    [43.4, 42.95], [44.5, 42.7], [45.5, 42.4], [46.4, 42.0], [47.3, 41.6],
    [48.2, 41.25], [49.0, 40.95], [49.6, 40.55],
  ];
  const ridgeMat = new THREE.LineDashedMaterial({
    color: 0xa5f3fc,
    transparent: true,
    opacity: 0.8,
    dashSize: 0.012,
    gapSize: 0.008,
  });
  const ridgeLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(caucasusRidge.map(([lon, lat]) => latLonToVec3(lat, lon, 1.016, THREE))),
    ridgeMat
  );
  ridgeLine.computeLineDistances();
  globeGroup.add(ridgeLine);

  const caucasusCenter = { lat: 41.8, lon: 44.6 };
  const regionRingPts: any[] = [];
  const centerVec = latLonToVec3(caucasusCenter.lat, caucasusCenter.lon, 1, THREE).normalize();
  const east = new THREE.Vector3(0, 1, 0).cross(centerVec).normalize();
  const north = new THREE.Vector3().crossVectors(centerVec, east).normalize();
  const ringAngle = (6.8 * Math.PI) / 180;
  for (let k = 0; k <= 96; k++) {
    const a = (k / 96) * Math.PI * 2;
    const v = centerVec
      .clone()
      .multiplyScalar(Math.cos(ringAngle))
      .addScaledVector(east, Math.sin(ringAngle) * Math.cos(a) * 1.25)
      .addScaledVector(north, Math.sin(ringAngle) * Math.sin(a) * 0.8)
      .normalize()
      .multiplyScalar(1.014);
    regionRingPts.push(v);
  }
  const regionRingMat = new THREE.LineDashedMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.45,
    dashSize: 0.02,
    gapSize: 0.014,
  });
  const regionRing = new THREE.Line(new THREE.BufferGeometry().setFromPoints(regionRingPts), regionRingMat);
  regionRing.computeLineDistances();
  globeGroup.add(regionRing);

  // Pin generator for locations
  function makePin(lat: number, lon: number, colorHex: number) {
    const pos = latLonToVec3(lat, lon, 1.02, THREE);
    const pinMat = new THREE.MeshBasicMaterial({ color: colorHex });
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 12), pinMat);
    pin.position.copy(pos);
    globeGroup.add(pin);

    // Reticle ring
    const rMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.022, 0.028, 32), rMat);
    ring.position.copy(pos);
    ring.lookAt(new THREE.Vector3(0, 0, 0));
    ring.rotateX(Math.PI / 2);
    globeGroup.add(ring);

    // Crosshair lines
    const crossSize = 0.045;
    const cMat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.55 });
    const norm = pos.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(norm, up).normalize().multiplyScalar(crossSize);
    const forward = new THREE.Vector3().crossVectors(right, norm).normalize().multiplyScalar(crossSize);
    globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([pos.clone().add(right), pos.clone().sub(right)]), cMat));
    globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([pos.clone().add(forward), pos.clone().sub(forward)]), cMat));

    return { pin, pinMat, ring, ringMat: rMat };
  }

  // Generate pins for Detroit, Baku, NYC, and Miami
  const pins = GLOBE_LOCATIONS.map((loc) => {
    const colorHex = parseInt(loc.color.replace('#', '0x'), 16);
    return makePin(loc.lat, loc.lon, colorHex);
  });

  // Atmosphere glow
  const atmosMat = new THREE.MeshBasicMaterial({
    color: t.globeColor,
    transparent: true,
    opacity: 0.06,
    side: THREE.BackSide,
  });
  ctx.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.12, 40, 40), atmosMat));

  // Lighting
  ctx.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const dirLight = new THREE.DirectionalLight(t.globeColor, 1.2);
  dirLight.position.set(3, 3, 3);
  ctx.scene.add(dirLight);

  return {
    update(time: number) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.003);
      pins.forEach((p) => {
        p.ring.scale.setScalar(1 + pulse * 0.18);
        p.ringMat.opacity = 0.35 + pulse * 0.35;
      });

      earthUniforms.uTime.value = time * 0.001;

      // Home regions breathe gently (held steady under reduced motion)
      const breathe = ctx.reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(time * 0.0018);
      for (let k = 0; k < highlightMats.length; k++) {
        const h = highlightMats[k];
        h.fill.opacity = h.base * (0.75 + 0.35 * breathe);
        h.glow.opacity = 0.2 + 0.3 * breathe;
      }
    },
    destroy() {
      landMaskTexture?.dispose();
    }
  };
}
