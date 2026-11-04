import * as THREE from 'three';
import { hash, fract, smoothstep, mulberry32 } from '../../util.js';
import { FLOOR_Y, LEGS, NODULE, SHELL_OUTLINE, HINGE, SHELL_OPEN, outlineAt } from './layout.js';
import { bodyPoseAt, footAt, legPhase, activityAt, GAIT, STRIDE } from './path.js';
import { bubbleAt, rimBubbleAt, shellAt } from './timeline.js';
import { VENTS } from './face.js';

// 海の底の小物: 口から出る泡・甲羅を開くときに逃げる泡・足が砂を蹴る煙・砂の上の小石と砂紋・拾う物(団塊)。
// どれも時刻だけで決まる(泡は生まれた時刻の体の場所から、水の中を浮いていく)
const MOUTH_N = 200, RIM_N = 80, PUFF_PER = 6;
const LIFE = 3.4, RISE = 0.42;

export function buildFx(m) {
  const group = new THREE.Group();
  const anchors = {};
  const sphere = new THREE.SphereGeometry(1, 10, 8);

  // ---- 泡
  const bubbles = new THREE.InstancedMesh(sphere, m.bubble, MOUTH_N + RIM_N);
  bubbles.frustumCulled = false;
  bubbles.castShadow = false;
  group.add(bubbles);
  anchors.bubbles = new THREE.Object3D();
  group.add(anchors.bubbles);

  // ---- 砂の煙(足を下ろしたとき)
  const sand = new THREE.MeshStandardMaterial({ color: 0xb3a895, roughness: 1, transparent: true, opacity: 0.5, depthWrite: false });
  const puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), sand, LEGS.length * 2 * PUFF_PER);
  puffs.frustumCulled = false;
  puffs.castShadow = false;
  group.add(puffs);

  // ---- 砂の上の小石(歩く道をよけて)と砂紋の線
  const rnd = mulberry32(5);
  const stones = [];
  while (stones.length < 34) {
    const x = -6 + 12 * rnd(), z = -3.5 + 6.5 * rnd();
    if (z > -1.6 && z < 1.25 && x > -8 && x < 7.5) continue;              // 歩く道
    if (Math.hypot(x - NODULE.x, z - NODULE.z) < 0.6) continue;
    stones.push([x, z, 0.03 + 0.06 * rnd() ** 2, rnd()]);
  }
  const pebbleMats = [m.shell, new THREE.MeshStandardMaterial({ color: 0x9c968d, roughness: 0.85 })];
  const pebbleGeo = new THREE.IcosahedronGeometry(1, 1);
  pebbleMats.forEach((mat, k) => {
    const list = stones.filter((s) => (s[3] < 0.35 ? 1 : 0) === k);
    const mesh = new THREE.InstancedMesh(pebbleGeo, mat, list.length);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach(([x, z, r, h], i) => {
      q.setFromEuler(e.set(h * 3, h * 7, h * 5));
      mesh.setMatrixAt(i, mm.compose(new THREE.Vector3(x, FLOOR_Y + r * 0.35, z), q, new THREE.Vector3(r * 1.3, r * 0.6, r)));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
  const rippleMat = new THREE.LineBasicMaterial({ color: 0xcdc5b8, transparent: true, opacity: 0.55 });
  for (let k = 0; k < 9; k++) {
    const z0 = -3.2 + k * 0.75;
    const pts = [];
    for (let i = 0; i <= 90; i++) {
      const x = -7 + (14 * i) / 90;
      pts.push(new THREE.Vector3(x, FLOOR_Y + 0.003, z0 + 0.12 * Math.sin(x * 0.9 + k * 1.7) + 0.05 * Math.sin(x * 2.3 + k)));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), rippleMat);
    group.add(line);
  }

  // ---- 拾う物(マンガンの団塊: 暗いでこぼこの石)
  const rockGeo = new THREE.IcosahedronGeometry(NODULE.r, 1);
  const p = rockGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + 0.18 * (hash(i * 3.7 + Math.round(p.getX(i) * 97)) - 0.5);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k);
  }
  rockGeo.computeVertexNormals();
  const nodule = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x3b3833, roughness: 0.85, metalness: 0.1, flatShading: true }));
  nodule.castShadow = true;
  const tag = new THREE.Mesh(new THREE.TorusGeometry(NODULE.r * 0.75, 0.008, 6, 20), m.orange);
  tag.rotation.x = Math.PI / 2;
  nodule.add(tag);
  group.add(nodule);
  anchors.nodule = new THREE.Object3D();
  anchors.nodule.position.set(0, NODULE.r, 0);
  nodule.add(anchors.nodule);
  const NODULE_REST = new THREE.Vector3(NODULE.x, FLOOR_Y + NODULE.r * 0.8, NODULE.z);

  // ---- 毎コマ
  const bp = new THREE.Vector3(), bq = new THREE.Quaternion();
  const src = new THREE.Vector3(), dir = new THREE.Vector3(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const mat = new THREE.Matrix4(), q0 = new THREE.Quaternion();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const hingeV = new THREE.Vector3(...HINGE), X = new THREE.Vector3(1, 0, 0);
  const ob = [0, 0];

  // 泡 i(生まれた時刻 tb、年 age)の場所。emit(tb, h) が生まれた場所 src と向き dir を書く
  function bubble(i, t, rate, emit, life, size) {
    const u = t / life + hash(i);
    const cycle = Math.floor(u);
    const age = fract(u) * life;
    const tb = t - age;
    if (rate(tb) <= hash(i * 7.3 + cycle * 1.7) * 0.95 + 0.02) return false;
    const h1 = hash(i * 3.1 + cycle), h2 = hash(i * 5.7 + cycle), h3 = hash(i * 11.3 + cycle), h4 = hash(i * 13.9 + cycle);
    emit(tb, h4);
    // 吹き出す勢いは水の抵抗ですぐ弱まり、あとは揺れながら浮く
    const d = (0.25 + 0.3 * h1) * (1 - Math.exp(-3 * age));
    pos.copy(src).addScaledVector(dir, d);
    const wob = 0.03 + age * 0.05;
    pos.x += wob * Math.sin(age * 5 + h2 * 6) + (h2 - 0.5) * age * 0.12;
    pos.z += wob * Math.cos(age * 4.3 + h3 * 6) + (h3 - 0.5) * age * 0.12;
    pos.y += RISE * age * (0.8 + 0.4 * h1) + 0.12 * age * age;
    const r = size * (0.5 + h1) * (1 + age * 0.35) * smoothstep(0, 0.15, age) * (1 - smoothstep(0.82, 1, age / life));
    mat.compose(pos, q0, scl.set(r, r, r));
    return true;
  }
  const emitMouth = (tb, h) => {
    bodyPoseAt(tb, bp, bq);
    const v = VENTS[h < 0.5 ? 0 : 1];
    src.copy(v.pos).applyQuaternion(bq).add(bp);
    dir.copy(v.dir).applyQuaternion(bq);
  };
  const emitRim = (tb, h) => {
    bodyPoseAt(tb, bp, bq);
    // 甲羅の前半分のふち(開きかけの甲羅の下のすき間)
    outlineAt(SHELL_OUTLINE, 0.2 + 0.6 * h, ob);
    src.set(ob[0] * 0.98, 0.0, ob[1] * 0.98).sub(hingeV).applyAxisAngle(X, -SHELL_OPEN * shellAt(tb) * 0.5).add(hingeV);
    src.y -= 0.02;
    src.applyQuaternion(bq).add(bp);
    dir.set(ob[0], 0.8, ob[1]).normalize().applyQuaternion(bq);
  };

  const fp = new THREE.Vector3();
  function update(t, show, nodulePos) {
    // 泡
    let n = 0;
    for (let i = 0; i < MOUTH_N; i++) {
      const on = show && bubble(i, t, bubbleAt, emitMouth, LIFE, 0.022);
      bubbles.setMatrixAt(i, on ? mat : ZERO);
      if (on) n++;
      if (on && i === 7) anchors.bubbles.position.copy(pos);
    }
    for (let i = 0; i < RIM_N; i++) {
      const on = show && bubble(MOUTH_N + i, t, rimBubbleAt, emitRim, 2.4, 0.026);
      bubbles.setMatrixAt(MOUTH_N + i, on ? mat : ZERO);
      if (on) n++;
    }
    bubbles.instanceMatrix.needsUpdate = true;
    bubbles.visible = n > 0;

    // 砂の煙: 脚ごとに、直近 2 回の足を下ろした時刻から
    const G = GAIT.floor, D = STRIDE.floor;
    let k = 0;
    LEGS.forEach((L, i) => {
      const { n: step } = legPhase('floor', i, t);
      for (let back = 0; back < 2; back++) {
        const st = step - back;
        const tl = G.tAt((st - L.offset) * D);   // この歩みの足を下ろした時刻
        const age = t - tl;
        const strength = activityAt('floor', tl);
        const live = age >= 0 && age < 1.1 && strength > 0.35 && tl > 0.05;
        if (live) footAt('floor', i, tl + 0.002, fp);
        for (let j = 0; j < PUFF_PER; j++) {
          if (!live) {
            puffs.setMatrixAt(k++, ZERO);
            continue;
          }
          const h1 = hash(i * 31 + st * 7.1 + j), h2 = hash(i * 17 + st * 3.3 + j * 5.1);
          const a = h1 * Math.PI * 2;
          const out = (0.08 + 0.16 * h2) * (1 - Math.exp(-4 * age));
          pos.set(fp.x + Math.cos(a) * out, FLOOR_Y + 0.02 + (0.05 + 0.08 * h2) * (1 - Math.exp(-5 * age)) - 0.03 * age, fp.z + Math.sin(a) * out);
          const r = (0.018 + 0.02 * h1) * (1 + 1.2 * age) * (1 - smoothstep(0.4, 1.1, age)) * strength;
          puffs.setMatrixAt(k++, mat.compose(pos, q0, scl.set(r, r * 0.7, r)));
        }
      }
    });
    puffs.instanceMatrix.needsUpdate = true;

    // 拾う物
    if (nodulePos === null) nodule.visible = false;
    else {
      nodule.visible = true;
      nodule.position.copy(nodulePos ?? NODULE_REST);
    }
  }

  return { group, anchors, update, NODULE_REST, nodule };
}
