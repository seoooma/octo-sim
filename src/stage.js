import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { COLORS } from './materials.js';
import { hash } from './util.js';

// 舞台: 描画の準備・光・床・背景の軌道の線・仕上げ(隅の影)
export const FLOOR_Y = -2.2;

function circle(r, segments = 128) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

export function createStage(container, { preserve = false, snow = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: preserve });
  const touch = window.matchMedia('(pointer: coarse)').matches;   // スマホ・タブレット
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, touch ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // 背景は暖かい白(見本の真ん中 ≈ (253,250,245))。色の調子(Neutral)を通ると暗くなるので、線形で 1 より明るい値を置く
  scene.background = new THREE.Color().setRGB(3.0, 2.9, 2.75);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;

  const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.5, 9.4);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 2.5;
  controls.maxDistance = 40;

  // 光: 左上前からの主光(影を落とす)+右からの弱い光+空と床の照り返し
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc9bf, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(-4, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(touch ? 1024 : 2048);   // スマホは影の細かさを半分に
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  key.shadow.radius = 4;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xfff4ea, 0.6);
  fill.position.set(6, 3, 4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.5);   // 下から見上げたときの返し
  rim.position.set(0, -6, 3);
  scene.add(rim);

  // 床: 影だけ受ける透明な面と、細い同心円
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.13 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  scene.add(floor);
  const lineMat = new THREE.LineBasicMaterial({ color: COLORS.floorLine, transparent: true, opacity: 0.7 });
  for (const r of [2.6, 4.2, 6.4]) {
    const c = new THREE.Line(circle(r), lineMat);
    c.position.y = FLOOR_Y + 0.002;
    scene.add(c);
  }

  // 背景の軌道の線(傾いた大きな円と、その上の小さな丸の印)
  const orbitMat = new THREE.LineBasicMaterial({ color: 0xb9b4ac, transparent: true, opacity: 0.55 });
  const orbits = new THREE.Group();
  for (const [r, rx, rz, marks] of [[3.6, 1.18, 0.25, 4], [5.2, 1.42, -0.4, 5], [4.4, 0.35, 1.25, 3]]) {
    const o = new THREE.Group();
    o.rotation.set(rx, 0, rz);
    o.add(new THREE.Line(circle(r, 180), orbitMat));
    for (let i = 0; i < marks; i++) {
      const a = (i / marks) * Math.PI * 2 + r;
      const mark = new THREE.Line(circle(0.09, 24), orbitMat);
      mark.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      mark.rotation.x = Math.PI / 2;
      o.add(mark);
    }
    orbits.add(o);
  }
  scene.add(orbits);

  // 水の中の細かな粒(マリンスノー)。ゆっくり漂うだけで動かないので、ロボットが泳ぐと粒が後ろへ流れて見える
  const SNOW = 420;
  const snowMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({ color: 0x8e8a84, transparent: true, opacity: 0.5, depthWrite: false }),
    SNOW,
  );
  snowMesh.frustumCulled = false;
  snowMesh.visible = snow;
  const snowBase = Array.from({ length: SNOW }, (_, i) => [
    -10 + 24 * hash(i * 1.7), FLOOR_Y + 0.3 + 9 * hash(i * 2.3 + 5), -9 + 16 * hash(i * 3.1 + 9), 0.012 + 0.022 * hash(i * 4.9 + 2),
  ]);
  const sm = new THREE.Matrix4();
  // t: 台本の時刻(粒の漂いも時刻だけで決める)
  function tick(t) {
    if (!snowMesh.visible) return;
    snowBase.forEach(([x, y, z, r], i) => {
      sm.makeScale(r, r, r).setPosition(x + 0.25 * Math.sin(0.11 * t + i), y + 0.15 * Math.sin(0.07 * t + i * 1.3) + 0.03 * t, z + 0.2 * Math.sin(0.09 * t + i * 0.7));
      snowMesh.setMatrixAt(i, sm);
    });
    snowMesh.instanceMatrix.needsUpdate = true;
  }
  scene.add(snowMesh);

  // 仕上げ: 隅の影(GTAO)→ 色の調子
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  // スマホは軽く(MSAA と GTAO の標本を半分に)
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: touch ? 2 : 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.2, thickness: 0.8, scale: 1.6, samples: touch ? 8 : 16 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: touch ? 8 : 16 });
  gtao.blendIntensity = 1;
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
  // RT を渡すと composer は「描画バッファの幅 × 画素比」で各パスを作る(画素比の 2 乗になる)。窓の大きさで作り直す
  composer.setSize(window.innerWidth, window.innerHeight);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  function render(ao) {
    if (ao) composer.render();
    else renderer.render(scene, camera);
  }

  return { renderer, scene, camera, controls, orbits, render, tick };
}
