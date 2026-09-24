import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createLighting } from './lighting.js';
import { createCity, PITCH } from './city.js';
import { createPlayer, HALF_HEIGHT, RADIUS } from './player.js';
import { createCar } from './vehicle.js';
import { createHud } from './hud.js';

const STEP = 1 / 60;
const MAX_STEPS = 5;
const ENTER_RANGE = 3.3;
const MOUSE_SENS = 0.0025;

await RAPIER.init();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1500);
const lighting = createLighting(renderer, scene);

const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.timestep = STEP;
const events = new RAPIER.EventQueue(true);
const tags = new Map();

const city = createCity(RAPIER, world, scene, tags);
const road = 0.5 * PITCH;
const cars = [
  { x: road - 5.75, z: -20, yaw: 0, color: 0xa3161a },
  { x: road + 5.75, z: -4, yaw: Math.PI, color: 0x1d3f73 },
  { x: 10, z: road - 5.75, yaw: -Math.PI / 2, color: 0xd8d4c8 },
  { x: -road - 5.75, z: 12, yaw: 0, color: 0x2b5a34 },
].map((c) => createCar(RAPIER, world, scene, tags, c));
const player = createPlayer(RAPIER, world, scene, { x: road - 9.4, y: 0.15, z: -27, yaw: 0 });

const keys = new Set();
let interact = false, jump = false, mouseX = 0, mouseY = 0, lastMouse = -1e9;
const hud = createHud(() => {
  hud.hideHint();
  lockPointer();
});

function lockPointer() {
  const p = renderer.domElement.requestPointerLock?.();
  if (p && p.catch) p.catch(() => {});
}

addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  hud.hideHint();
  if (e.repeat) return;
  if (e.code === 'KeyE') interact = true;
  if (e.code === 'Space') jump = true;
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
renderer.domElement.addEventListener('mousedown', () => {
  hud.hideHint();
  if (!document.pointerLockElement) lockPointer();
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement && !(e.buttons & 1)) return;
  mouseX += e.movementX;
  mouseY += e.movementY;
  lastMouse = performance.now();
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

let state = 'on_foot';
let car = null;
const collisions = [];
let shake = 0;
const cam = { yaw: Math.PI, pitch: 0.28, dist: 4.2 };
const camTarget = new THREE.Vector3();
const camDir = new THREE.Vector3();
const exitShape = new RAPIER.Capsule(HALF_HEIGHT, RADIUS);
const identity = { x: 0, y: 0, z: 0, w: 1 };
const solid = (c) => tags.get(c.handle) === 'building' || tags.get(c.handle) === 'ground';
const walls = (c) => tags.get(c.handle) === 'building';

function nearestCar() {
  let best = null, bestD = ENTER_RANGE;
  for (const c of cars) {
    const d = Math.hypot(c.position.x - player.position.x, c.position.z - player.position.z);
    if (d < bestD && Math.abs(c.position.y - player.position.y) < 2) (best = c), (bestD = d);
  }
  return best;
}

function playerOverlaps(p) {
  return !!world.intersectionWithShape(p, identity, exitShape, undefined, undefined, player.collider);
}

function tryExit() {
  const f = car.forward();
  const yaw = Math.atan2(f.x, f.z);
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  for (const [lx, lz] of [[1.75, 0.3], [-1.75, 0.3], [0, -3.3], [0, 3.3], [2.8, 0.3], [-2.8, 0.3]]) {
    const x = car.position.x + lx * cos + lz * sin;
    const z = car.position.z - lx * sin + lz * cos;
    const hit = world.castRay(new RAPIER.Ray({ x, y: car.position.y + 2.5, z }, { x: 0, y: -1, z: 0 }), 8, true, undefined, undefined, undefined, undefined, solid);
    if (!hit) continue;
    const p = { x, y: car.position.y + 2.5 - hit.timeOfImpact + HALF_HEIGHT + RADIUS + 0.05, z };
    if (p.y > car.position.y + 1.5 || playerOverlaps(p)) continue;
    const ray = new RAPIER.Ray({ x: car.position.x, y: p.y, z: car.position.z }, { x: x - car.position.x, y: 0, z: z - car.position.z });
    if (world.castRay(ray, 1, true, undefined, undefined, undefined, undefined, walls)) continue;
    player.setActive(true);
    player.teleport(p, yaw + Math.PI / 2);
    return true;
  }
  return false;
}

function fixedUpdate() {
  if (interact) {
    interact = false;
    if (state === 'on_foot') {
      const c = nearestCar();
      if (c) {
        car = c;
        state = 'driving';
        player.setActive(false);
      }
    } else if (tryExit()) {
      state = 'on_foot';
      car = null;
    }
  }
  if (state === 'on_foot') player.fixedUpdate(STEP, keys, cam.yaw, jump);
  jump = false;

  player.storePrev();
  for (const c of cars) {
    c.storePrev();
    c.fixedUpdate(STEP, c === car ? keys : null);
  }
  world.step(events);
  events.drainCollisionEvents((h1, h2, started) => {
    if (!started) return;
    const a = tags.get(h1), b = tags.get(h2);
    if (a !== 'car' && b !== 'car') return;
    const other = a === 'car' ? b : a;
    const speed = car ? Math.abs(car.speed()) : 0;
    collisions.push({ with: other, speed, t: performance.now() });
    if (other !== 'ground' && speed > 4) shake = Math.max(shake, Math.min(1, speed / 18));
  });
  player.storeCur();
  for (const c of cars) c.storeCur();
}

function updateCamera(dt) {
  const idle = performance.now() - lastMouse > 1200;
  cam.yaw -= mouseX * MOUSE_SENS;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + mouseY * MOUSE_SENS, -0.35, 1.2);
  mouseX = mouseY = 0;

  let dist;
  if (state === 'driving') {
    const f = car.forward();
    const behind = Math.atan2(-f.x, -f.z);
    if (idle) {
      const d = Math.atan2(Math.sin(behind - cam.yaw), Math.cos(behind - cam.yaw));
      cam.yaw += d * Math.min(1, dt * 4);
      cam.pitch += (0.2 - cam.pitch) * Math.min(1, dt * 2);
    }
    camTarget.copy(car.group.position).y += 1.2;
    dist = 7.2;
    const kmh = Math.abs(car.speed()) * 3.6;
    camera.fov += (62 + Math.min(kmh, 160) * 0.06 - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  } else {
    camTarget.copy(player.smoothPosition).y += 0.68;
    dist = 4.2;
    if (camera.fov !== 62) {
      camera.fov = 62;
      camera.updateProjectionMatrix();
    }
  }
  camDir.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  const hit = world.castRay(new RAPIER.Ray(camTarget, camDir), dist, true, undefined, undefined, undefined, undefined, walls);
  const allowed = hit ? Math.max(0.8, hit.timeOfImpact - 0.3) : dist;
  cam.dist = allowed < cam.dist ? allowed : cam.dist + (allowed - cam.dist) * Math.min(1, dt * 3);
  camera.position.copy(camTarget).addScaledVector(camDir, cam.dist);
  camera.lookAt(camTarget);
  if (shake > 0.01) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.4;
    camera.position.y += (Math.random() - 0.5) * shake * 0.4;
    shake *= Math.exp(-dt * 6);
  }
}

let acc = 0, last = performance.now(), frames = 0;
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < MAX_STEPS) {
    fixedUpdate();
    acc -= STEP;
    steps++;
  }
  if (steps === MAX_STEPS) acc = 0;
  const alpha = acc / STEP;

  player.render(alpha);
  for (const c of cars) c.render(alpha);
  city.update();
  updateCamera(dt);
  lighting.update(camera, state === 'driving' ? car.group.position : player.smoothPosition);

  if (state === 'driving') {
    hud.setSpeed(Math.abs(car.speed()) * 3.6);
    hud.setPrompt(null);
  } else {
    hud.setSpeed(null);
    hud.setPrompt(nearestCar() ? 'Press <b>E</b> to enter' : null);
  }
  renderer.render(scene, camera);
  frames++;
});

window.__city = {
  get state() { return state; },
  get frames() { return frames; },
  collisions,
  player: () => ({ ...player.position }),
  cars: () => cars.map((c) => ({ x: c.position.x, y: c.position.y, z: c.position.z, kmh: c.speed() * 3.6 })),
  activeCar: () => cars.indexOf(car),
  setCameraYaw: (y) => { cam.yaw = y; },
  playerOverlaps: () => playerOverlaps(player.position),
  carInsideBuilding: () => !!car && city.insideBuilding(car.position),
  renderer: () => {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  },
};
