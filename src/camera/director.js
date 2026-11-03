import * as THREE from 'three';
import { ACTIONS } from '../sim/timeline.js';
import { smoothstep, lerp } from '../util.js';

// カメラの段取り: 操作ごとの構図(位置・注視点・画角)と、つなぎ。
// follow はロボットの動きにどれだけ付いていくか(1 で完全に追う)。
const SHOTS = {
  inbound: { pos: [-0.6, 0.6, 10.5], target: [0.2, -0.3, 0], fov: 30, follow: 1 },
  hold: { pos: [0, 1.5, 9.4], target: [0, -0.45, 0], fov: 30, follow: 1 },
  mantle: { pos: [0.8, 4.4, 7.0], target: [0, 0.15, 0], fov: 30, follow: 1 },
  arm: { pos: [-3.4, 3.0, 13.5], target: [-2.6, -0.3, 0.9], fov: 30, follow: 1 },
  optics: { pos: [2.0, 0.5, 5.8], target: [0.1, -0.2, 0.6], fov: 28, follow: 1 },
  beak: { pos: [0.3, -3.9, 11.4], target: [0, -0.9, 0], fov: 30, follow: 1 },
  siphon: { pos: [-7.0, -1.8, -5.6], target: [0, -1.0, -0.5], fov: 30, follow: 1 },
  depart: { pos: [-0.8, 1.0, 9.2], target: [0.6, 0, 0], fov: 30, follow: 0.55 },
};
const BLEND = 1.6;       // 構図を切り替える時間(秒)
const IDLE_BACK = 4;     // 手で回したあと、何秒で段取りに戻るか(再生中だけ。止めているあいだは戻さない)
const NARROW_MAX = 1.8;  // 縦長の画面でカメラを遠ざける上限(腕の先は切れてよい)

const v = new THREE.Vector3();
const posA = new THREE.Vector3();
const posB = new THREE.Vector3();
const tgtA = new THREE.Vector3();
const tgtB = new THREE.Vector3();
const wantTarget = new THREE.Vector3();
const sphA = new THREE.Spherical();
const sphB = new THREE.Spherical();
const sph = new THREE.Spherical();

function place(shot, robot, outPos, outTarget) {
  outTarget.fromArray(shot.target).addScaledVector(robot, shot.follow);
  outPos.fromArray(shot.pos).addScaledVector(robot, shot.follow);
}

// 2 つの球面の座標を u で混ぜる(横の角度は近いほうを回る)
function mixSpherical(out, a, b, u) {
  let dTheta = b.theta - a.theta;
  if (dTheta > Math.PI) dTheta -= Math.PI * 2;
  if (dTheta < -Math.PI) dTheta += Math.PI * 2;
  return out.set(lerp(a.radius, b.radius, u), lerp(a.phi, b.phi, u), a.theta + dTheta * u);
}

export class Director {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.manual = false;     // 指・マウスで動かしている最中
    this.free = false;       // 手で動かした視点を保っている
    this.moved = false;
    this.lastTouch = -Infinity;
    this.target = new THREE.Vector3();
    controls.addEventListener('start', () => {
      this.manual = true;
      this.moved = false;
    });
    controls.addEventListener('change', () => {
      if (this.manual) this.moved = true;
    });
    controls.addEventListener('end', () => {
      this.manual = false;
      // 動かさなかったタップは数えない
      if (this.moved) {
        this.free = true;
        this.lastTouch = performance.now();
      }
    });
  }

  // すぐ段取りのカメラに戻す(再生・シーク・ASSEMBLIES・FREE VIEW を押したとき)
  release() {
    this.manual = false;
    this.free = false;
    this.lastTouch = -Infinity;
  }

  // 手で動かした視点を保っているか(画面の「FREE VIEW」の表示にも使う)
  get freeView() {
    return this.manual || this.free;
  }

  // s: 台本の状態、robot: ロボットの位置、dt: 前のコマからの秒、immediate: なめらかにせずすぐ置く(静止画)、paused: 一時停止中
  update(s, robot, dt, immediate = false, paused = false) {
    if (!immediate && (this.manual || (this.free && (paused || performance.now() - this.lastTouch < IDLE_BACK * 1000)))) {
      this.controls.update();
      this.target.copy(this.controls.target);   // 平行移動した注視点も覚えておく(戻るとき跳ばない)
      return;
    }
    this.free = false;
    const cur = SHOTS[s.act.key];
    const prev = SHOTS[ACTIONS[(s.index + ACTIONS.length - 1) % ACTIONS.length].key];
    const u = smoothstep(0, BLEND, s.since);
    place(prev, robot, posA, tgtA);
    place(cur, robot, posB, tgtB);
    // 構図のつなぎは注視点のまわりの球面で(ロボットを突き抜けない)
    sphA.setFromVector3(v.copy(posA).sub(tgtA));
    sphB.setFromVector3(v.copy(posB).sub(tgtB));
    mixSpherical(sph, sphA, sphB, u);
    sph.radius *= Math.min(NARROW_MAX, Math.max(1, 1.15 / this.camera.aspect));   // 縦長の画面は遠ざける
    wantTarget.copy(tgtA).lerp(tgtB, u);
    const fov = lerp(prev.fov, cur.fov, u);
    if (immediate) {
      this.target.copy(wantTarget);
      this.camera.position.setFromSpherical(sph).add(this.target);
    } else {
      // 今の位置から、注視点のまわりの球面に沿って寄せる(手で裏へ回したあとも突き抜けない)
      const k = 1 - Math.exp(-dt * 4);
      sphA.setFromVector3(v.copy(this.camera.position).sub(this.target));
      mixSpherical(sphB, sphA, sph, k);
      this.target.lerp(wantTarget, k);
      this.camera.position.setFromSpherical(sphB).add(this.target);
    }
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.controls.target.copy(this.target);
    this.camera.lookAt(this.target);
  }
}
