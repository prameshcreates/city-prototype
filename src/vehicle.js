import * as THREE from 'three';

const MASS = 1250;
const WHEEL_RADIUS = 0.34;
const REST_LENGTH = 0.32;
const WHEELS = [
  [0.8, 1.32, true],
  [-0.8, 1.32, true],
  [0.8, -1.28, false],
  [-0.8, -1.28, false],
];
const ENGINE = 2700;
const REVERSE = 1500;
const TOP_SPEED = 52;
const BRAKE = 28;
const HANDBRAKE = 70;
const PARKED_BRAKE = 12;
const DRAG = 0.9;
const MAX_STEER = 0.6;
const STEER_RATE = 2.6;
const REAR_GRIP = 1.0;
const HANDBRAKE_GRIP = 0.35;

function extrude(points, depth, bevel) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 16 })
    .rotateY(-Math.PI / 2)
    .translate(depth / 2, 0, 0);
}

function bodyShape() {
  const s = new THREE.Shape();
  s.moveTo(-2.12, -0.28);
  s.lineTo(-1.72, -0.28);
  s.absarc(-1.28, -0.3, 0.44, Math.PI, 0, true);
  s.lineTo(0.88, -0.28);
  s.absarc(1.32, -0.3, 0.44, Math.PI, 0, true);
  s.lineTo(2.1, -0.28);
  s.quadraticCurveTo(2.24, -0.2, 2.2, 0.02);
  s.quadraticCurveTo(2.16, 0.18, 1.9, 0.24);
  s.lineTo(0.9, 0.32);
  s.lineTo(-1.62, 0.34);
  s.quadraticCurveTo(-2.1, 0.33, -2.18, 0.2);
  s.lineTo(-2.2, -0.12);
  s.quadraticCurveTo(-2.2, -0.26, -2.12, -0.28);
  return s;
}

function buildMesh(color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0d1319, metalness: 0.2, roughness: 0.05, clearcoat: 1 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd3d6, metalness: 1, roughness: 0.2 });
  const add = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const width = 1.74;
  add(new THREE.ExtrudeGeometry(bodyShape(), { depth: width, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 16 })
    .rotateY(-Math.PI / 2).translate(width / 2, 0, 0), paint);
  add(extrude([[0.92, 0.3], [0.08, 0.8], [-0.95, 0.82], [-1.58, 0.32]], 1.46, 0.04), glass);
  add(extrude([[0.14, 0.79], [-0.92, 0.81], [-0.98, 0.87], [0.06, 0.85]], 1.5, 0.03), paint);
  add(new THREE.BoxGeometry(1.86, 0.14, 0.2).translate(0, -0.2, 2.2), trim);
  add(new THREE.BoxGeometry(1.86, 0.14, 0.2).translate(0, -0.2, -2.2), trim);
  add(new THREE.BoxGeometry(1.2, 0.08, 0.04).translate(0, 0.02, 2.27), chrome);
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 1.2 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x5a0808, emissive: 0xc01010, emissiveIntensity: 0.9 });
  for (const x of [-0.62, 0.62]) {
    add(new THREE.BoxGeometry(0.36, 0.1, 0.06).translate(x, 0.12, 2.2), head);
    add(new THREE.BoxGeometry(0.34, 0.1, 0.06).translate(x, 0.2, -2.22), tail);
    add(new THREE.BoxGeometry(0.06, 0.08, 0.16).translate(x > 0 ? 0.95 : -0.95, 0.4, 0.62), trim);
  }

  const tireGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.24, 24).rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.25, 12).rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.26, 0.05, 0.36);
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const wheels = WHEELS.map(() => {
    const pivot = new THREE.Group();
    const spin = new THREE.Group();
    for (const [g, m] of [[tireGeo, rubber], [rimGeo, chrome], [spokeGeo, chrome]]) {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = true;
      spin.add(mesh);
    }
    const cross = spin.children[2].clone();
    cross.rotation.x = Math.PI / 2;
    spin.add(cross);
    pivot.add(spin);
    group.add(pivot);
    return { pivot, spin };
  });
  return { group, wheels };
}

export function createCar(RAPIER, world, scene, tags, { x, z, yaw, color }) {
  const { group, wheels } = buildMesh(color);
  scene.add(group);

  const rot = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, 0.72, z)
      .setRotation(rot)
      .setAdditionalMassProperties(MASS, { x: 0, y: -0.38, z: 0.05 }, { x: 2100, y: 2400, z: 820 }, { x: 0, y: 0, z: 0, w: 1 })
      .setCcdEnabled(true)
      .setAngularDamping(0.4)
      .setLinearDamping(0.02),
  );
  const events = RAPIER.ActiveEvents.COLLISION_EVENTS;
  for (const desc of [
    RAPIER.ColliderDesc.cuboid(0.92, 0.28, 2.2).setTranslation(0, -0.02, 0),
    RAPIER.ColliderDesc.cuboid(0.74, 0.25, 1.15).setTranslation(0, 0.54, -0.3),
  ]) {
    const c = world.createCollider(desc.setDensity(0).setFriction(0.5).setRestitution(0.15).setActiveEvents(events), body);
    tags.set(c.handle, 'car');
  }

  const vc = world.createVehicleController(body);
  vc.indexUpAxis = 1;
  vc.setIndexForwardAxis = 2;
  WHEELS.forEach(([wx, wz, front], i) => {
    vc.addWheel({ x: wx, y: -0.05, z: wz }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, REST_LENGTH, WHEEL_RADIUS);
    vc.setWheelSuspensionStiffness(i, 34);
    vc.setWheelSuspensionCompression(i, 2.3);
    vc.setWheelSuspensionRelaxation(i, 3.0);
    vc.setWheelMaxSuspensionTravel(i, 0.24);
    vc.setWheelMaxSuspensionForce(i, 80000);
    vc.setWheelFrictionSlip(i, front ? 1.7 : 1.6);
    vc.setWheelSideFrictionStiffness(i, REAR_GRIP);
  });

  let steer = 0;
  const prevPos = new THREE.Vector3(), curPos = new THREE.Vector3(x, 0.72, z);
  const prevRot = rot.clone(), curRot = rot.clone();
  const tmpV = new THREE.Vector3();

  const car = {
    body,
    group,
    speed: () => vc.currentVehicleSpeed(),
    position: curPos,
    rotation: curRot,
    forward: () => tmpV.set(0, 0, 1).applyQuaternion(curRot),

    fixedUpdate(dt, input) {
      const speed = vc.currentVehicleSpeed();
      let engine = 0, brake = 0, handbrake = false, steerInput = 0;
      if (input) {
        const fwd = input.has('KeyW') || input.has('ArrowUp');
        const back = input.has('KeyS') || input.has('ArrowDown');
        steerInput = (input.has('KeyA') || input.has('ArrowLeft') ? 1 : 0) - (input.has('KeyD') || input.has('ArrowRight') ? 1 : 0);
        handbrake = input.has('Space');
        if (fwd && speed > -1) engine = ENGINE * Math.max(0, 1 - speed / TOP_SPEED);
        else if (fwd) brake = BRAKE;
        if (back && speed > 1) brake = BRAKE;
        else if (back && speed > -9) engine = -REVERSE;
        if (!fwd && !back) brake = 1.5;
      } else {
        brake = PARKED_BRAKE;
      }
      const maxSteer = MAX_STEER / (1 + Math.abs(speed) / 12);
      const target = steerInput * maxSteer;
      steer += Math.sign(target - steer) * Math.min(Math.abs(target - steer), STEER_RATE * dt);

      for (let i = 0; i < 4; i++) {
        const front = WHEELS[i][2];
        vc.setWheelSteering(i, front ? steer : 0);
        vc.setWheelEngineForce(i, front ? 0 : engine);
        vc.setWheelBrake(i, handbrake && !front ? HANDBRAKE : brake);
        if (!front) vc.setWheelSideFrictionStiffness(i, handbrake ? HANDBRAKE_GRIP : REAR_GRIP);
      }
      vc.updateVehicle(dt);

      const v = body.linvel();
      const s = Math.hypot(v.x, v.y, v.z);
      if (s > 0.5) body.applyImpulse({ x: -v.x * s * DRAG * dt, y: -v.y * s * DRAG * dt, z: -v.z * s * DRAG * dt }, true);
    },

    storePrev() {
      prevPos.copy(curPos);
      prevRot.copy(curRot);
    },

    storeCur() {
      const t = body.translation(), r = body.rotation();
      curPos.set(t.x, t.y, t.z);
      curRot.set(r.x, r.y, r.z, r.w);
    },

    render(alpha) {
      group.position.lerpVectors(prevPos, curPos, alpha);
      group.quaternion.slerpQuaternions(prevRot, curRot, alpha);
      for (let i = 0; i < 4; i++) {
        const len = vc.wheelSuspensionLength(i) ?? REST_LENGTH;
        const w = wheels[i];
        w.pivot.position.set(WHEELS[i][0], -0.05 - len, WHEELS[i][1]);
        w.pivot.rotation.y = vc.wheelSteering(i) ?? 0;
        w.spin.rotation.x = vc.wheelRotation(i) ?? 0;
      }
    },
  };
  car.storeCur();
  car.storePrev();
  return car;
}
