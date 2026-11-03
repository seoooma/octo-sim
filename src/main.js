import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { COLORS, makeMaterials } from './materials.js';
import { buildBody } from './body.js';
import { Arms } from './arms.js';

// URL の指定: ?t=2.5 その時刻で止めて 1 枚描く(静止画用)、?view=front|diag|top|side|eye、?curl=0〜1、?ao=0 隅の影なし、?gui 調整用のつまみ
const params = new URLSearchParams(location.search);
const fixedTime = params.has('t') ? parseFloat(params.get('t')) : null;
const state = {
  curl: params.has('curl') ? parseFloat(params.get('curl')) : 1,
  ao: params.get('ao') !== '0',
  turntable: params.has('turntable'),
};

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: fixedTime !== null });
const touch = window.matchMedia('(pointer: coarse)').matches;   // スマホ・タブレット
renderer.setPixelRatio(Math.min(window.devicePixelRatio, touch ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.background);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 100);
const VIEWS = {
  front: [[0, 1.5, 9], [0, -0.45, 0]],
  diag: [[5.2, 2.6, 7.4], [0, -0.45, 0]],
  top: [[0, 11, 3], [0, -0.4, 0]],
  side: [[11, 1.2, 0], [0, -0.4, 0]],
  eye: [[1.6, 0.4, 4.2], [0.3, -0.1, 0.6]],
};
const [camPos, camTarget] = VIEWS[params.get('view')] ?? VIEWS.front;
camera.position.fromArray(camPos);
// 縦長の画面(スマホを縦に持ったとき)は、腕が切れすぎないようにカメラを遠ざける
const narrow = Math.max(1, 1.5 / camera.aspect);
camera.position.sub(new THREE.Vector3().fromArray(camTarget)).multiplyScalar(narrow).add(new THREE.Vector3().fromArray(camTarget));
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.fromArray(camTarget);
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 40;

// 光: 左上前からの主光(影を落とす)+右からの弱い光+空と床の照り返し
scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc9bf, 0.45));
const key = new THREE.DirectionalLight(0xffffff, 2.8);
key.position.set(-4, 9, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
key.shadow.radius = 4;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);
const fill = new THREE.DirectionalLight(0xfff4ea, 0.6);
fill.position.set(6, 3, 4);
scene.add(fill);

// 床: 影だけ受ける透明な面と、細い同心円
const FLOOR_Y = -2.2;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.13 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = FLOOR_Y;
floor.receiveShadow = true;
scene.add(floor);
const lineMat = new THREE.LineBasicMaterial({ color: COLORS.floorLine, transparent: true, opacity: 0.7 });
for (const r of [2.6, 4.2, 6.4]) {
  const pts = [];
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, FLOOR_Y + 0.002, Math.sin(a) * r));
  }
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
}

// ロボット
const mats = makeMaterials();
const robot = new THREE.Group();
const body = buildBody(mats);
const arms = new Arms(mats);
robot.add(body.group, arms.group);
robot.traverse((o) => {
  if (o.isMesh) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
});
scene.add(robot);

// 仕上げ: 隅の影(GTAO)→ 色の調子
const size = new THREE.Vector2();
renderer.getDrawingBufferSize(size);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, size.x, size.y);
gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.2, thickness: 0.8, scale: 1.6, samples: 16 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
gtao.blendIntensity = 1;
composer.addPass(gtao);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

if (params.has('gui')) {
  const gui = new GUI();
  gui.add(state, 'curl', 0, 1, 0.01).name('arm curl');
  gui.add(state, 'ao').name('ambient occlusion');
  gui.add(state, 'turntable');
}

function frame(t) {
  robot.position.y = 0.05 * Math.sin(t * 0.8);
  robot.rotation.y = state.turntable ? t * 0.25 : 0;
  arms.update(t, state.curl);
  controls.update();
  if (state.ao) composer.render();
  else renderer.render(scene, camera);
}

if (fixedTime !== null) {
  frame(fixedTime);
  frame(fixedTime);
  requestAnimationFrame(() => {
    window.__ready = true;
  });
} else {
  const timer = new THREE.Timer();
  timer.connect(document);   // タブが隠れているあいだは時間を進めない
  renderer.setAnimationLoop((now) => {
    timer.update(now);
    frame(timer.getElapsed());
  });
}
