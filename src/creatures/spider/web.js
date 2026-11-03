import * as THREE from 'three';
import { smoothstep, clamp } from '../../util.js';
import { WEB, RADIAL_COUNT, radialAngle, FLOOR_Y } from './layout.js';
import { T, SPIRAL_PTS, SPIRAL_START_S, radialSpin, spinneretAt, travelAt } from './path.js';

// 巣を張る輪と、糸(引き糸・縦糸・横糸・粘りの玉)。糸はどれも時刻だけで決まる。
const SILK_R = 0.013;        // 糸の太さ(半径)
const LAG = 1.25;            // 横糸は、体の進んだ道のりからこれだけ遅れて張られる(おしりの先から出るので)
const BEADS = 5;             // 横糸の 1 辺あたりの粘りの玉
export const TOP = new THREE.Vector3(WEB.cx, WEB.cy + WEB.R, WEB.z);   // 引き糸を留める輪のてっぺん
const HUB = new THREE.Vector3(WEB.cx, WEB.cy, WEB.z);
export const DRAG_FIRE = [9.3, 9.8];   // 引き糸を打ち上げる時刻

const rimPoint = (k, out) => out.set(WEB.cx + WEB.R * Math.cos(radialAngle(k)), WEB.cy + WEB.R * Math.sin(radialAngle(k)), WEB.z);

// 縦糸 k を打つ時刻(体が回って、おしりがその向きを指したとき)
export const RADIAL_FIRE = Array.from({ length: RADIAL_COUNT }, (_, k) => {
  if (k === 0) return T.air1;   // 0 番(真上)は登ってきた引き糸
  let lo = T.radial0, hi = T.radial1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (radialSpin(mid) * RADIAL_COUNT < k) lo = mid;
    else hi = mid;
  }
  return lo;
});
const FLY = 0.3;   // 縦糸の先が輪まで飛ぶ時間

// 横糸の頂点までの道のり(体の道 SPIRAL_WALK の上で)
const SPIRAL_S = [SPIRAL_START_S];
for (let j = 1; j < SPIRAL_PTS.length; j++) {
  SPIRAL_S.push(SPIRAL_S[j - 1] + Math.hypot(SPIRAL_PTS[j][0] - SPIRAL_PTS[j - 1][0], SPIRAL_PTS[j][1] - SPIRAL_PTS[j - 1][1]));
}

// 横糸をどこまで張ったか(道のり)。張り終えたら最後まで
export function spiralLaidAt(t) {
  if (t < T.spiral0) return 0;
  const tr = travelAt(t, {});
  return tr.spiralS === undefined ? 0 : t >= T.spiral1 ? SPIRAL_S[SPIRAL_S.length - 1] : tr.spiralS - LAG;
}

// 張った糸の長さ(計器用)
export function silkLengthAt(t) {
  let len = 0;
  if (t > DRAG_FIRE[0]) len += TOP.distanceTo(HUB) * clamp((t - DRAG_FIRE[0]) / (DRAG_FIRE[1] - DRAG_FIRE[0]));
  for (let k = 1; k < RADIAL_COUNT; k++) len += WEB.R * clamp((t - RADIAL_FIRE[k]) / FLY);
  len += Math.max(0, spiralLaidAt(t) - SPIRAL_START_S);
  return len;
}
export const radialsDoneAt = (t) => RADIAL_FIRE.filter((ft) => t >= ft + FLY).length;

export function buildWeb(m) {
  const group = new THREE.Group();
  const anchors = {};

  // 輪(暗い金属)と、縦糸を留める金具(白い台にオレンジの点)
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(WEB.R, 0.07, 16, 180), m.darkMetal);
  hoop.position.set(WEB.cx, WEB.cy, WEB.z);
  group.add(hoop);
  for (let k = 0; k < RADIAL_COUNT; k++) {
    const a = radialAngle(k);
    const clampBox = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), m.shell);
    clampBox.position.set(WEB.cx + (WEB.R - 0.02) * Math.cos(a), WEB.cy + (WEB.R - 0.02) * Math.sin(a), WEB.z);
    clampBox.rotation.z = a;
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), m.orange);
    dot.rotation.x = Math.PI / 2;
    dot.position.set(0, 0, 0.11);
    clampBox.add(dot);
    group.add(clampBox);
    if (k === 0) anchors.top = clampBox;
    if (k === 3) anchors.rim = clampBox;
  }
  // 台: 輪の下の左右から床へ 2 本の脚と、床の横木
  const strut = (a, foot) => {
    const p = new THREE.Vector3(WEB.cx + WEB.R * Math.cos(a), WEB.cy + WEB.R * Math.sin(a), WEB.z);
    const q = new THREE.Vector3(foot, FLOOR_Y + 0.06, WEB.z);
    const len = p.distanceTo(q);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, len, 16), m.darkMetal);
    mesh.position.copy(p).add(q).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize());
    group.add(mesh);
  };
  strut(-Math.PI / 2 - 0.62, -2.6);
  strut(-Math.PI / 2 + 0.62, 2.6);
  const base = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.1, 0.5), m.shell);
  base.position.set(WEB.cx, FLOOR_Y + 0.05, WEB.z);
  group.add(base);
  for (const x of [-2.6, 2.6]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.08, 24), m.orange);
    foot.position.set(x, FLOOR_Y + 0.13, WEB.z);
    group.add(foot);
  }

  // 糸: 細い円柱を並べる(引き糸 1・縦糸 12・横糸・おしりの先への引き出し 1)
  const segCount = 1 + RADIAL_COUNT + (SPIRAL_PTS.length - 1) + 1;
  const silk = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), m.silk, segCount);
  silk.frustumCulled = false;
  silk.castShadow = false;
  group.add(silk);
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), m.bead, (SPIRAL_PTS.length - 1) * BEADS);
  beads.frustumCulled = false;
  beads.castShadow = false;
  group.add(beads);
  // 縦糸の先に付いて飛ぶ小さな銛(オレンジ)
  const dart = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 12), m.orange);
  group.add(dart);
  anchors.hub = new THREE.Object3D();
  anchors.hub.position.copy(HUB).add(new THREE.Vector3(0.35, -0.5, 0));
  anchors.spiral = new THREE.Object3D();
  anchors.bead = new THREE.Object3D();
  group.add(anchors.hub, anchors.spiral, anchors.bead);

  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), mid = new THREE.Vector3(), sc = new THREE.Vector3();
  const spin = new THREE.Vector3(), lay = new THREE.Vector3();
  let si = 0;
  const line = (p0, p1, r = SILK_R) => {
    d.subVectors(p1, p0);
    const len = d.length();
    if (len < 1e-4) return;
    q.setFromUnitVectors(Y, d.divideScalar(len));
    mid.addVectors(p0, p1).multiplyScalar(0.5);
    silk.setMatrixAt(si++, mat.compose(mid, q, sc.set(r, len, r)));
  };
  const spiralPoint = (j, out) => out.set(SPIRAL_PTS[j][0], SPIRAL_PTS[j][1], WEB.z);

  // t: 時刻、raise: おなかの持ち上げ(糸いぼの位置)、show: 糸を見せるか
  function update(t, raise, show) {
    si = 0;
    dart.visible = false;
    if (show) {
      spinneretAt(t, spin, raise);
      // 引き糸: 打ち上げ → 体と輪のてっぺんのあいだ → 登ったあとは 0 番の縦糸
      if (t >= DRAG_FIRE[0] && t < T.air1) {
        const u = smoothstep(DRAG_FIRE[0], DRAG_FIRE[1], t);
        b.copy(spin).lerp(TOP, u);
        line(spin, b);
        if (u < 1) {
          dart.visible = true;
          dart.position.copy(b);
          dart.quaternion.setFromUnitVectors(Y, d.subVectors(TOP, spin).normalize());
        }
      }
      // 縦糸(真ん中から輪へ飛ぶ)
      for (let k = 0; k < RADIAL_COUNT; k++) {
        const u = k === 0 ? (t >= T.air1 ? 1 : 0) : clamp((t - RADIAL_FIRE[k]) / FLY);
        if (u <= 0) continue;
        rimPoint(k, b);
        a.copy(HUB).lerp(b, u);
        line(HUB, a);
        if (u < 1) {
          dart.visible = true;
          dart.position.copy(a);
          dart.quaternion.setFromUnitVectors(Y, d.subVectors(b, HUB).normalize());
        }
      }
      // 横糸(張った頂点まで + 途中まで)と、おしりの先への引き出し
      const laid = spiralLaidAt(t);
      let last = null;
      for (let j = 1; j < SPIRAL_PTS.length; j++) {
        if (laid <= SPIRAL_S[j - 1]) break;
        spiralPoint(j - 1, a);
        spiralPoint(j, b);
        const f = clamp((laid - SPIRAL_S[j - 1]) / (SPIRAL_S[j] - SPIRAL_S[j - 1]));
        b.lerp(a, 1 - f);
        line(a, b);
        last = lay.copy(b);
        if (f === 1 && j === 9) anchors.bead.position.copy(a).lerp(b, 0.5);
      }
      if (last) anchors.spiral.position.copy(last);
      if (last && t < T.spiral1 + 0.3) line(last, spin, SILK_R * 0.8);
    }
    for (let i = si; i < silk.count; i++) silk.setMatrixAt(i, mat.makeScale(0, 0, 0));
    silk.instanceMatrix.needsUpdate = true;

    // 粘りの玉(張った横糸の上だけ)
    const laid = show ? spiralLaidAt(t) : 0;
    let bi = 0;
    for (let j = 1; j < SPIRAL_PTS.length; j++) {
      const on = laid >= SPIRAL_S[j];
      spiralPoint(j - 1, a);
      spiralPoint(j, b);
      for (let n = 0; n < BEADS; n++) {
        if (on) {
          mid.copy(a).lerp(b, (n + 0.5) / BEADS);
          const r = 0.022 + 0.008 * Math.sin(j * 3.1 + n * 1.7);
          beads.setMatrixAt(bi++, mat.compose(mid, q.identity(), sc.set(r, r, r)));
        } else beads.setMatrixAt(bi++, mat.makeScale(0, 0, 0));
      }
    }
    beads.instanceMatrix.needsUpdate = true;
  }

  return { group, anchors, update };
}
