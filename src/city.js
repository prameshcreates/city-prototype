import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PITCH = 74;
export const ROAD = 14;
export const BLOCK = PITCH - ROAD;
const HALF_BLOCK = BLOCK / 2;
const SIDEWALK = 4;
const CURB = 0.15;
const GRID = [-2, -1, 0, 1, 2];
const PARK = [-1, 1];
const EDGE = 2.5 * PITCH;

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(size, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function noise(ctx, size, base, spread, count, rand, alpha = 1) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const v = Math.floor((rand() - 0.5) * spread);
    ctx.fillStyle = `rgba(${128 + v},${128 + v},${128 + v},${alpha * rand() * 0.25})`;
    const s = 1 + rand() * 3;
    ctx.fillRect(rand() * size, rand() * size, s, s);
  }
}

function facadeTextures(style, rand) {
  const bays = 4;
  const draw = (rough) => (ctx, size) => {
    const b = size / bays;
    ctx.fillStyle = rough ? '#d0d0d0' : style.wall;
    ctx.fillRect(0, 0, size, size);
    if (!rough && style.brick) {
      ctx.fillStyle = 'rgba(230,210,190,0.18)';
      for (let y = 0; y < size; y += 6) ctx.fillRect(0, y, size, 1);
      for (let y = 0; y < size; y += 6)
        for (let x = (y / 6) % 2 ? 0 : 6; x < size; x += 12) ctx.fillRect(x, y, 1, 6);
    }
    if (!rough && style.band) {
      ctx.fillStyle = style.band;
      for (let j = 0; j < bays; j++) ctx.fillRect(0, j * b + b - b * 0.08, size, b * 0.08);
    }
    for (let i = 0; i < bays; i++) {
      for (let j = 0; j < bays; j++) {
        const [wx, wy, ww, wh] = style.win;
        const x = i * b + wx * b, y = j * b + wy * b, w = ww * b, h = wh * b;
        if (!rough) {
          ctx.fillStyle = style.frame;
          ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
        }
        if (rough) {
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(x, y, w, h);
          continue;
        }
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        const lit = rand();
        g.addColorStop(0, lit > 0.85 ? '#6d6a5c' : style.glass[0]);
        g.addColorStop(1, style.glass[1]);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        if (rand() > 0.55) {
          ctx.fillStyle = `rgba(225,215,195,${0.25 + rand() * 0.35})`;
          ctx.fillRect(x, y, w, h * (0.2 + rand() * 0.5));
        }
        if (style.mullion) {
          ctx.fillStyle = style.frame;
          ctx.fillRect(x + w / 2 - 1.5, y, 3, h);
        }
        if (style.sill) {
          ctx.fillStyle = style.sill;
          ctx.fillRect(x - 4, y + h + 1, w + 8, 4);
        }
      }
    }
  };
  const map = canvasTexture(512, draw(false));
  map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = canvasTexture(512, draw(true));
  return { map, roughnessMap, tileW: style.bay * bays, tileH: style.floor * bays };
}

const STYLES = [
  { wall: '#b9b3a8', glass: ['#3b5064', '#1b2733'], frame: '#4c5156', win: [0.04, 0.22, 0.92, 0.74], mullion: true, bay: 3, floor: 3.6 },
  { wall: '#8c4f3d', glass: ['#34424c', '#161d23'], frame: '#e4ded2', win: [0.28, 0.25, 0.44, 0.55], brick: true, sill: '#d8d0c2', bay: 3.2, floor: 3.2 },
  { wall: '#d3c8b3', glass: ['#415059', '#1e272d'], frame: '#3c3a36', win: [0.2, 0.28, 0.6, 0.5], band: '#bfb39c', bay: 3, floor: 3.3 },
];

function wallGeometry(cx, y0, cz, w, h, d, tileW, tileH, color) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const faces = [
    [[cx - w / 2, y0, cz + d / 2], [w, 0, 0], [0, 0, 1]],
    [[cx + w / 2, y0, cz - d / 2], [-w, 0, 0], [0, 0, -1]],
    [[cx + w / 2, y0, cz + d / 2], [0, 0, -d], [1, 0, 0]],
    [[cx - w / 2, y0, cz - d / 2], [0, 0, d], [-1, 0, 0]],
  ];
  for (const [o, r, n] of faces) {
    const len = Math.hypot(r[0], r[2]);
    const base = pos.length / 3;
    for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(o[0] + r[0] * a, o[1] + h * b, o[2] + r[2] * a);
      nor.push(...n);
      uv.push((a * len) / tileW, (b * h) / tileH);
      col.push(color.r, color.g, color.b);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function box(w, h, d, x, y, z) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

const noUv = (g) => g.deleteAttribute('uv');

function shadowed(mesh, cast = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

export function createCity(RAPIER, world, scene, tags) {
  const rand = rng(7);
  const blocks = [];
  for (const i of GRID) for (const j of GRID) blocks.push({ x: i * PITCH, z: j * PITCH, park: i === PARK[0] && j === PARK[1], dist: Math.hypot(i, j) });

  // ground
  const asphalt = canvasTexture(512, (ctx, s) => {
    noise(ctx, s, '#3a3b3d', 70, 16000, rand);
    ctx.strokeStyle = 'rgba(20,20,20,0.35)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      let x = rand() * s, y = rand() * s;
      ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) ctx.lineTo((x += (rand() - 0.5) * 40), (y += (rand() - 0.5) * 40));
      ctx.stroke();
    }
  });
  asphalt.colorSpace = THREE.SRGBColorSpace;
  asphalt.repeat.set((EDGE * 2) / 10, (EDGE * 2) / 10);
  const road = shadowed(new THREE.Mesh(
    new THREE.PlaneGeometry(EDGE * 2, EDGE * 2).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92 }),
  ), false);
  scene.add(road);

  const dirt = canvasTexture(256, (ctx, s) => noise(ctx, s, '#6d6a4f', 60, 6000, rand));
  dirt.colorSpace = THREE.SRGBColorSpace;
  dirt.repeat.set(120, 120);
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2).translate(0, -0.02, 0),
    new THREE.MeshStandardMaterial({ map: dirt, roughness: 1 }),
  );
  outer.receiveShadow = true;
  scene.add(outer);
  tags.set(world.createCollider(RAPIER.ColliderDesc.cuboid(1200, 0.5, 1200).setTranslation(0, -0.5, 0).setFriction(1)).handle, 'ground');

  // lane markings
  const white = [], yellow = [];
  const mark = (list, x, z, w, l, alongZ) => list.push(alongZ ? [x, z, w, l] : [x, z, l, w]);
  const roadLines = [-1.5, -0.5, 0.5, 1.5].map((k) => k * PITCH);
  for (const r of roadLines) {
    for (const c of GRID) {
      const a = c * PITCH - HALF_BLOCK, b = c * PITCH + HALF_BLOCK;
      for (const alongZ of [true, false]) {
        const at = (off, s) => (alongZ ? [r + off, s] : [s, r + off]);
        for (let s = a + 6; s < b - 6; s += 6) mark(yellow, ...at(0, s + 1.5), 0.14, 3, alongZ);
        for (const off of [-4.5, 4.5]) mark(white, ...at(off, (a + b) / 2), 0.12, BLOCK - 2, alongZ);
        for (const [end, dir] of [[a, 1], [b, -1]]) {
          for (let k = -6.2; k <= 6.2; k += 1.2) mark(white, ...at(k, end + dir * 2), 0.55, 3, alongZ);
          const side = alongZ ? dir : -dir;
          mark(white, ...at(side * 2.25, end + dir * 4.1), 4.5, 0.4, alongZ);
        }
      }
    }
  }
  const markGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  for (const [list, color] of [[white, 0xe8e6de], [yellow, 0xe0b53a]]) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.InstancedMesh(markGeo, mat, list.length);
    const m = new THREE.Matrix4();
    list.forEach(([x, z, sx, sz], i) => mesh.setMatrixAt(i, m.makeScale(sx, 1, sz).setPosition(x, 0.012, z)));
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // sidewalks
  const paving = canvasTexture(256, (ctx, s) => {
    noise(ctx, s, '#a9a59d', 40, 5000, rand);
    ctx.fillStyle = 'rgba(60,58,54,0.35)';
    for (let k = 0; k < s; k += s / 4) { ctx.fillRect(k, 0, 2, s); ctx.fillRect(0, k, s, 2); }
  });
  paving.colorSpace = THREE.SRGBColorSpace;
  const slabGeo = new THREE.BoxGeometry(BLOCK, CURB, BLOCK).translate(0, CURB / 2, 0);
  const slabUv = slabGeo.attributes.uv;
  for (let i = 0; i < slabUv.count; i++) slabUv.setXY(i, (slabUv.getX(i) * BLOCK) / 3, (slabUv.getY(i) * BLOCK) / 3);
  const slabs = new THREE.InstancedMesh(slabGeo, new THREE.MeshStandardMaterial({ map: paving, roughness: 0.85 }), blocks.length);
  const grass = canvasTexture(256, (ctx, s) => noise(ctx, s, '#4f6b34', 90, 9000, rand));
  grass.colorSpace = THREE.SRGBColorSpace;
  grass.repeat.set(12, 12);
  const m4 = new THREE.Matrix4();
  blocks.forEach((b, i) => {
    slabs.setMatrixAt(i, m4.makeTranslation(b.x, 0, b.z));
    tags.set(world.createCollider(RAPIER.ColliderDesc.cuboid(HALF_BLOCK, CURB / 2, HALF_BLOCK).setTranslation(b.x, CURB / 2, b.z)).handle, 'ground');
    if (b.park) {
      const lawn = new THREE.Mesh(
        new THREE.BoxGeometry(BLOCK - SIDEWALK * 2, 0.04, BLOCK - SIDEWALK * 2).translate(b.x, CURB + 0.02, b.z),
        new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }),
      );
      lawn.receiveShadow = true;
      scene.add(lawn);
      const path = new THREE.Mesh(
        mergeGeometries([box(3, 0.02, BLOCK - 8, b.x, CURB + 0.045, b.z), box(BLOCK - 8, 0.02, 3, b.x, CURB + 0.045, b.z)]),
        new THREE.MeshStandardMaterial({ map: paving, roughness: 0.85 }),
      );
      path.receiveShadow = true;
      scene.add(path);
    }
  });
  slabs.receiveShadow = true;
  slabs.castShadow = true;
  scene.add(slabs);

  // buildings
  const wallParts = STYLES.map(() => []);
  const facades = STYLES.map((s) => facadeTextures(s, rand));
  const trim = [];
  const footprints = [];
  const inner = HALF_BLOCK - SIDEWALK;
  for (const b of blocks) {
    if (b.park) continue;
    const splitsX = rand() < 0.5 ? [0.5, 0.5] : [0.35, 0.3, 0.35];
    const splitsZ = rand() < 0.5 ? [0.5, 0.5] : [0.6, 0.4];
    let x0 = b.x - inner;
    for (const sx of splitsX) {
      const lw = sx * inner * 2;
      let z0 = b.z - inner;
      for (const sz of splitsZ) {
        const ld = sz * inner * 2;
        const si = Math.floor(rand() * STYLES.length);
        const f = facades[si];
        const bay = STYLES[si].bay, floor = STYLES[si].floor;
        const w = Math.max(2, Math.floor((lw - 2) / bay)) * bay;
        const d = Math.max(2, Math.floor((ld - 2) / bay)) * bay;
        const tall = b.dist < 1.5 ? 6 + rand() * 12 : 3 + rand() * 5;
        const h = Math.round(tall) * floor;
        const cx = x0 + lw / 2, cz = z0 + ld / 2;
        const tint = new THREE.Color().setHSL(rand(), 0.08, 0.8 + rand() * 0.25);
        wallParts[si].push(wallGeometry(cx, CURB, cz, w, h, d, f.tileW, f.tileH, tint));
        trim.push(box(w + 0.4, 0.6, d + 0.4, cx, CURB + h + 0.3, cz), box(w + 0.2, 0.9, d + 0.2, cx, CURB + 0.45, cz));
        for (let k = 0; k < 2 + rand() * 3; k++) {
          const s = 1.5 + rand() * 3;
          trim.push(box(s, 1 + rand() * 1.6, s * (0.6 + rand() * 0.6), cx + (rand() - 0.5) * (w - s - 2), CURB + h + 0.9, cz + (rand() - 0.5) * (d - s - 2)));
        }
        tags.set(world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2 + 0.1, h / 2 + 0.3, d / 2 + 0.1).setTranslation(cx, CURB + h / 2 + 0.3, cz)).handle, 'building');
        footprints.push({ minX: cx - w / 2 - 0.1, maxX: cx + w / 2 + 0.1, minZ: cz - d / 2 - 0.1, maxZ: cz + d / 2 + 0.1 });
        z0 += ld;
      }
      x0 += lw;
    }
  }
  wallParts.forEach((parts, i) => {
    if (!parts.length) return;
    const mat = new THREE.MeshStandardMaterial({ map: facades[i].map, roughnessMap: facades[i].roughnessMap, roughness: 1, metalness: 0.05, vertexColors: true });
    scene.add(shadowed(new THREE.Mesh(mergeGeometries(parts), mat)));
  });
  const trimGeo = mergeGeometries(trim.map(noUv));
  scene.add(shadowed(new THREE.Mesh(trimGeo, new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.9 }))));

  // perimeter barrier and distant skyline
  const barrier = [];
  for (const s of [-1, 1]) {
    barrier.push(box(EDGE * 2, 0.9, 0.6, 0, 0.45, s * (EDGE - 1)), box(0.6, 0.9, EDGE * 2, s * (EDGE - 1), 0.45, 0));
    tags.set(world.createCollider(RAPIER.ColliderDesc.cuboid(EDGE, 2, 0.3).setTranslation(0, 2, s * (EDGE - 1))).handle, 'building');
    tags.set(world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 2, EDGE).setTranslation(s * (EDGE - 1), 2, 0)).handle, 'building');
  }
  scene.add(shadowed(new THREE.Mesh(mergeGeometries(barrier), new THREE.MeshStandardMaterial({ color: 0xb4b0a8, roughness: 0.8 }))));
  const skyline = [];
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2 + rand() * 0.03, r = 280 + rand() * 180;
    const w = 12 + rand() * 25, h = 15 + rand() * (r < 360 ? 70 : 120);
    skyline.push(noUv(box(w, h, w, Math.cos(a) * r, h / 2, Math.sin(a) * r)));
  }
  scene.add(new THREE.Mesh(mergeGeometries(skyline), new THREE.MeshStandardMaterial({ color: 0x8c96a2, roughness: 0.9 })));

  // props
  const props = [];
  const lampSpots = [], treeSpots = [], benchSpots = [], binSpots = [];
  for (const b of blocks) {
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const along = (t, inset) => {
        const px = b.x + nx * (HALF_BLOCK - inset) + (nz !== 0 ? t : 0);
        const pz = b.z + nz * (HALF_BLOCK - inset) + (nx !== 0 ? t : 0);
        return [px, pz, Math.atan2(nx, nz)];
      };
      for (const t of [-20, 0, 20]) lampSpots.push(along(t, 0.6));
      for (const t of [-10, 10]) treeSpots.push(along(t + (rand() - 0.5) * 3, 1.6));
      if (rand() < 0.5) benchSpots.push(along(-5 + (rand() - 0.5) * 2, 3.2));
      if (rand() < 0.6) binSpots.push(along(21.5, 0.8));
    }
    if (b.park) {
      for (let k = 0; k < 22; k++) {
        const x = (rand() - 0.5) * (BLOCK - 14), z = (rand() - 0.5) * (BLOCK - 14);
        if (Math.abs(x) > 3.5 && Math.abs(z) > 3.5) treeSpots.push([b.x + x, b.z + z, 0]);
      }
      for (const [x, z, a] of [[5, 10, Math.PI / 2], [-5, -10, -Math.PI / 2], [10, -5, Math.PI], [-10, 5, 0]]) benchSpots.push([b.x + x, b.z + z, a]);
    }
  }

  const metal = new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.45, metalness: 0.7 });
  const lampGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.07, 0.1, 6, 10),
    new THREE.CylinderGeometry(0.18, 0.2, 0.5, 12).translate(0, -2.75, 0),
    box(0.08, 0.08, 1.6, 0, 2.9, 0.8),
    box(0.35, 0.14, 0.6, 0, 2.84, 1.55),
  ].map(noUv));
  const benchGeo = mergeGeometries([
    box(1.8, 0.07, 0.45, 0, 0.02, 0),
    box(1.8, 0.35, 0.05, 0, 0.3, -0.22),
    box(0.07, 0.45, 0.4, -0.75, -0.2, 0),
    box(0.07, 0.45, 0.4, 0.75, -0.2, 0),
  ].map(noUv));
  const binGeo = new THREE.CylinderGeometry(0.28, 0.24, 0.9, 14);

  const dynamicSet = (geo, mat, spots, colliderDesc, lift) => {
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    mesh.frustumCulled = false;
    const q = new THREE.Quaternion();
    spots.forEach(([x, z, a], i) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, CURB + lift, z).setRotation(q).setSleeping(true).setCanSleep(true));
      tags.set(world.createCollider(colliderDesc(), body).handle, 'prop');
      props.push({ body, mesh, i });
      mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(x, CURB + lift, z), q, new THREE.Vector3(1, 1, 1)));
    });
    scene.add(shadowed(mesh));
  };
  dynamicSet(lampGeo, metal, lampSpots, () => RAPIER.ColliderDesc.cylinder(3, 0.16).setDensity(420).setFriction(0.7), 3);
  dynamicSet(benchGeo, new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.7 }), benchSpots,
    () => RAPIER.ColliderDesc.cuboid(0.9, 0.4, 0.25).setTranslation(0, -0.02, 0).setDensity(220).setFriction(0.8), 0.43);
  dynamicSet(binGeo, new THREE.MeshStandardMaterial({ color: 0x2f4a3a, roughness: 0.6, metalness: 0.3 }), binSpots,
    () => RAPIER.ColliderDesc.cylinder(0.45, 0.28).setDensity(120).setFriction(0.7), 0.45);

  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 3, 8).translate(0, 1.5, 0);
  const leafGeo = new THREE.IcosahedronGeometry(1.6, 2);
  const lp = leafGeo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < lp.count; i++) {
    v.fromBufferAttribute(lp, i);
    const n = 1 + 0.18 * Math.sin(v.x * 3.1) * Math.cos(v.z * 2.7 + v.y * 1.9);
    lp.setXYZ(i, v.x * n, v.y * n * 0.9, v.z * n);
  }
  leafGeo.computeVertexNormals();
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.9 }), treeSpots.length);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), treeSpots.length * 2);
  const c = new THREE.Color();
  const q = new THREE.Quaternion();
  treeSpots.forEach(([x, z], i) => {
    const s = 0.85 + rand() * 0.4;
    const base = CURB;
    trunks.setMatrixAt(i, m4.compose(new THREE.Vector3(x, base, z), q.identity(), new THREE.Vector3(s, s, s)));
    for (let k = 0; k < 2; k++) {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rand() * 6);
      const ls = s * (k ? 0.75 : 1);
      leaves.setMatrixAt(i * 2 + k, m4.compose(new THREE.Vector3(x + (k ? 0.5 : 0), base + s * (k ? 4.9 : 3.9), z + (k ? -0.3 : 0)), q, new THREE.Vector3(ls, ls, ls)));
      leaves.setColorAt(i * 2 + k, c.setHSL(0.24 + rand() * 0.06, 0.45, 0.22 + rand() * 0.08));
    }
    tags.set(world.createCollider(RAPIER.ColliderDesc.cylinder(1.5, 0.22).setTranslation(x, base + 1.5, z)).handle, 'prop');
  });
  scene.add(shadowed(trunks), shadowed(leaves));

  const pos = new THREE.Vector3(), rot = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  const dirty = new Set();
  return {
    footprints,
    insideBuilding(p, margin = 0) {
      return footprints.some((f) => p.x > f.minX + margin && p.x < f.maxX - margin && p.z > f.minZ + margin && p.z < f.maxZ - margin);
    },
    update() {
      for (const p of props) {
        if (p.body.isSleeping()) continue;
        const t = p.body.translation(), r = p.body.rotation();
        p.mesh.setMatrixAt(p.i, m4.compose(pos.set(t.x, t.y, t.z), rot.set(r.x, r.y, r.z, r.w), one));
        dirty.add(p.mesh);
      }
      for (const m of dirty) m.instanceMatrix.needsUpdate = true;
      dirty.clear();
    },
  };
}
