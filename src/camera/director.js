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
const BLEND = 1.6;      // 構図を切り替える時間(秒)
const IDLE_BACK = 4;    // 手で回したあと、何秒で段取りに戻るか

const v = new THREE.Vector3();
const sphA = new THREE.Spherical();
const sphB = new THREE.Spherical();

function place(shot, robot, outPos, outTarget) {
  outTarget.fromArray(shot.target).addScaledVector(robot, shot.follow);
  outPos.fromArray(shot.pos).addScaledVector(robot, shot.follow);
}

export class Director {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.manual = false;
    this.lastTouch = -Infinity;
    this.posA = new THREE.Vector3();
    this.posB = new THREE.Vector3();
    this.tgtA = new THREE.Vector3();
    this.tgtB = new THREE.Vector3();
    this.target = new THREE.Vector3();
    controls.addEventListener('start', () => (this.manual = true));
    controls.addEventListener('end', () => {
      this.manual = false;
      this.lastTouch = performance.now();
    });
  }

  // すぐ段取りのカメラに戻す(シークや ASSEMBLIES を押したとき)
  release() {
    this.manual = false;
    this.lastTouch = -Infinity;
  }

  // 手で回しているあいだと、離してしばらくは段取りに戻さない
  get userHolds() {
    return this.manual || performance.now() - this.lastTouch < IDLE_BACK * 1000;
  }

  // s: 台本の状態、robot: ロボットの位置、dt: 前のコマからの秒、immediate: なめらかにせずすぐ置く(静止画)
  update(s, robot, dt, immediate = false) {
    if (this.userHolds && !immediate) {
      this.controls.update();
      return;
    }
    const cur = SHOTS[s.act.key];
    const prev = SHOTS[ACTIONS[(s.index + ACTIONS.length - 1) % ACTIONS.length].key];
    const u = smoothstep(0, BLEND, s.since);
    place(prev, robot, this.posA, this.tgtA);
    place(cur, robot, this.posB, this.tgtB);
    // 注視点のまわりの球面でつなぐ(ロボットを突き抜けない)
    sphA.setFromVector3(v.copy(this.posA).sub(this.tgtA));
    sphB.setFromVector3(v.copy(this.posB).sub(this.tgtB));
    let dTheta = sphB.theta - sphA.theta;
    if (dTheta > Math.PI) dTheta -= Math.PI * 2;
    if (dTheta < -Math.PI) dTheta += Math.PI * 2;
    const narrow = Math.max(1, 1.15 / this.camera.aspect);   // 縦長の画面は遠ざける(腕の先は少し切れてよい)
    const sph = new THREE.Spherical(lerp(sphA.radius, sphB.radius, u) * narrow, lerp(sphA.phi, sphB.phi, u), sphA.theta + dTheta * u);
    const target = v.copy(this.tgtA).lerp(this.tgtB, u);
    const pos = new THREE.Vector3().setFromSpherical(sph).add(target);
    const fov = lerp(prev.fov, cur.fov, u);
    if (immediate) {
      this.camera.position.copy(pos);
      this.target.copy(target);
    } else {
      const k = 1 - Math.exp(-dt * 4);
      this.camera.position.lerp(pos, k);
      this.target.lerp(target, k);
    }
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.controls.target.copy(this.target);
    this.camera.lookAt(this.target);
  }
}
