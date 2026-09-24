import * as THREE from 'three';

export const HALF_HEIGHT = 0.55;
export const RADIUS = 0.32;
const CENTER = HALF_HEIGHT + RADIUS;
const WALK = 3.4;
const SPRINT = 7.2;
const GRAVITY = 20;
const JUMP = 6.4;

function buildMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89478, roughness: 0.7 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2f6f73, roughness: 0.75 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2b2e38, roughness: 0.85 });
  const shoes = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.6 });
  const part = (geo, mat, parent = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  part(new THREE.CapsuleGeometry(0.2, 0.42, 4, 12).scale(1.15, 1, 0.75).translate(0, 1.25, 0), jacket);
  part(new THREE.SphereGeometry(0.13, 16, 12).translate(0, 1.68, 0), skin);
  part(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8).translate(0, 1.55, 0), skin);
  const limb = (x, y, len, r, mat, endMat) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    part(new THREE.CapsuleGeometry(r, len, 4, 8).translate(0, -len / 2 - r, 0), mat, pivot);
    part(new THREE.BoxGeometry(r * 2.2, r * 1.6, r * (endMat === shoes ? 4 : 2)).translate(0, -len - r * 1.8, endMat === shoes ? r : 0), endMat, pivot);
    group.add(pivot);
    return pivot;
  };
  const legs = [limb(-0.11, 0.9, 0.66, 0.085, pants, shoes), limb(0.11, 0.9, 0.66, 0.085, pants, shoes)];
  const arms = [limb(-0.29, 1.45, 0.5, 0.06, jacket, skin), limb(0.29, 1.45, 0.5, 0.06, jacket, skin)];
  return { group, legs, arms };
}

export function createPlayer(RAPIER, world, scene, spawn) {
  const { group, legs, arms } = buildMesh();
  scene.add(group);

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + CENTER, spawn.z));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS), body);
  const ctrl = world.createCharacterController(0.03);
  ctrl.enableAutostep(0.4, 0.2, false);
  ctrl.enableSnapToGround(0.35);
  ctrl.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
  ctrl.setApplyImpulsesToDynamicBodies(true);
  ctrl.setCharacterMass(80);

  const vel = new THREE.Vector3();
  let grounded = false;
  let facing = spawn.yaw ?? 0;
  let phase = 0;
  let stride = 0;
  const prev = new THREE.Vector3(), cur = new THREE.Vector3(spawn.x, spawn.y + CENTER, spawn.z);
  prev.copy(cur);
  const smooth = cur.clone();

  const player = {
    collider,
    position: cur,
    smoothPosition: smooth,

    fixedUpdate(dt, keys, camYaw, wantJump) {
      const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const r = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      let mx = -sin * f + cos * r, mz = -cos * f - sin * r;
      const len = Math.hypot(mx, mz);
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? SPRINT : WALK;
      if (len > 0) {
        mx /= len;
        mz /= len;
        facing = Math.atan2(mx, mz);
      }
      if (len > 0 || grounded) {
        const k = Math.min(1, (grounded ? 12 : 2) * dt);
        vel.x += (mx * speed - vel.x) * k;
        vel.z += (mz * speed - vel.z) * k;
      }
      if (grounded && wantJump) vel.y = JUMP;
      vel.y -= GRAVITY * dt;

      ctrl.computeColliderMovement(collider, { x: vel.x * dt, y: vel.y * dt, z: vel.z * dt });
      const m = ctrl.computedMovement();
      grounded = ctrl.computedGrounded();
      if (grounded && vel.y < 0) vel.y = -1;
      if (vel.y > 0 && m.y < vel.y * dt * 0.5) vel.y = 0;
      const t = body.translation();
      body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });

      const moved = Math.hypot(m.x, m.z) / dt;
      stride += (Math.min(moved / SPRINT, 1) - stride) * 0.2;
      phase += moved * dt * 2.4;
    },

    storePrev() { prev.copy(cur); },
    storeCur() {
      const t = body.translation();
      cur.set(t.x, t.y, t.z);
    },

    teleport(p, yaw) {
      body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
      body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
      cur.set(p.x, p.y, p.z);
      prev.copy(cur);
      smooth.copy(cur);
      vel.set(0, 0, 0);
      facing = yaw;
    },

    setActive(on) {
      collider.setEnabled(on);
      group.visible = on;
    },

    render(alpha) {
      smooth.lerpVectors(prev, cur, alpha);
      group.position.copy(smooth).y -= CENTER + 0.03;
      let d = facing - group.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      group.rotation.y += d * 0.25;
      const swing = Math.sin(phase) * 0.9 * stride;
      const air = grounded ? 0 : 0.5;
      legs[0].rotation.x = swing - air;
      legs[1].rotation.x = -swing + air * 0.4;
      arms[0].rotation.x = -swing * 0.8;
      arms[1].rotation.x = swing * 0.8;
      arms[0].rotation.z = -0.08 - air * 0.5;
      arms[1].rotation.z = 0.08 + air * 0.5;
    },
  };
  return player;
}
