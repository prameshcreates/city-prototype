import * as THREE from 'three';

const SUN_DIR = new THREE.Vector3(0.22, 0.85, 0.48).normalize();
const SHADOW_EXTENT = 70;
const SHADOW_MAP = 2048;
const HORIZON = new THREE.Color(0.62, 0.71, 0.8);

export function createLighting(renderer, scene) {
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0.17, 0.36, 0.68) },
      horizon: { value: HORIZON },
      ground: { value: new THREE.Color(0.32, 0.3, 0.28) },
      sunDir: { value: SUN_DIR },
      sunColor: { value: new THREE.Color(1.0, 0.86, 0.66) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 top, horizon, ground, sunDir, sunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = d.y > 0.0
          ? mix(horizon, top, pow(d.y, 0.55))
          : mix(horizon, ground, clamp(-d.y * 6.0, 0.0, 1.0));
        float s = max(dot(d, sunDir), 0.0);
        col += sunColor * (pow(s, 900.0) * 30.0 + pow(s, 12.0) * 0.35);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMaterial);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(sky.geometry, skyMaterial));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02, 1, 2000).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  scene.fog = new THREE.Fog(HORIZON.clone(), 90, 520);

  const hemi = new THREE.HemisphereLight(0xbcd4ec, 0x6a6258, 0.55);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0dc, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -SHADOW_EXTENT;
  cam.right = cam.top = SHADOW_EXTENT;
  cam.near = 1;
  cam.far = 600;
  cam.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);

  const lightRot = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(SUN_DIR, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)),
  );
  const lightRotInv = lightRot.clone().invert();
  const texel = (2 * SHADOW_EXTENT) / SHADOW_MAP;
  const snapped = new THREE.Vector3();

  return {
    update(camera, focus) {
      sky.position.copy(camera.position);
      snapped.copy(focus).applyQuaternion(lightRotInv);
      snapped.x = Math.round(snapped.x / texel) * texel;
      snapped.y = Math.round(snapped.y / texel) * texel;
      snapped.applyQuaternion(lightRot);
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).addScaledVector(SUN_DIR, 300);
    },
  };
}
