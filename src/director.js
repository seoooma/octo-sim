import * as THREE from 'three';
import { smoothstep, lerp } from './util.js';

// カメラの段取り: 操作ごとの構図(生き物ごとの shots: { 操作の key: { pos, target, fov, follow } })と、つなぎ。
// follow は生き物の動きにどれだけ付いていくか(1 で完全に追う)。
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
  // script: 台本(ACTIONS)、shots: 操作ごとの構図
  constructor(camera, controls, script, shots) {
    this.camera = camera;
    this.controls = controls;
    this.actions = script.ACTIONS;
    this.shots = shots;
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
    const A = this.actions;
    const cur = this.shots[s.act.key];
    const prev = this.shots[A[(s.index + A.length - 1) % A.length].key];
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
