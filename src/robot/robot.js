import * as THREE from 'three';
import { makeMaterials } from './materials.js';
import { buildBody } from './body.js';
import { buildCore } from './core.js';
import { buildBeak } from './beak.js';
import { buildSiphon } from './siphon.js';
import { Arms } from './arms.js';
import { jetAt, poseAt, pulseAt } from '../sim/timeline.js';
import { bodyPoseAt } from '../sim/swim.js';

const v = new THREE.Vector3();
const qSpin = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const bp = new THREE.Vector3();
const bq = new THREE.Quaternion();

// ロボット全体。台本の状態(sim/timeline.js の evaluate)と表示の切り替えを受けて、各部を動かす。
export class Robot {
  constructor() {
    const m = (this.materials = makeMaterials());
    this.group = new THREE.Group();     // 位置と向き(泳ぐ)
    this.body = buildBody(m);
    this.core = buildCore(m);
    this.beak = buildBeak(m);
    this.siphon = buildSiphon(m);
    this.arms = new Arms(m);
    this.group.add(this.body.group, this.core.group, this.beak.group, this.siphon.group, this.arms.group);
    // 世界に置く物(泡の跡: 体と一緒に動かず、水の中に残る)。main.js がシーンに足す
    this.world = new THREE.Group();
    this.world.add(this.siphon.bubbles);
    // 時刻 tb の体の行列(泡が生まれた場所を求める)
    this.bodyMatrixAt = (tb, m) => {
      bodyPoseAt(tb, bp, bq);
      return m.compose(bp, bq, ONE);
    };
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = o.material !== m.bubble;   // 泡は影を落とさない
        o.receiveShadow = true;
      }
    });

    // 引き出し線の組(画面の文字・小さな説明・付け根)
    const a = { ...this.body.anchors, ...this.core.anchors, ...this.beak.anchors, ...this.siphon.anchors };
    const arm = this.arms.anchors;
    this.labelSets = {
      mantle: [
        { title: 'REACTOR RING', sub: 'PUMP DRIVE', anchor: a.reactor },
        { title: 'DRIVE GEARS', sub: '44 × 18 TEETH', anchor: a.gears },
        { title: 'PUMP CORE', sub: '7 PISTONS', anchor: a.pump },
        { title: 'SHELL PETAL', sub: '8 PETALS · HINGED', anchor: a.petal },
        { title: 'GLASS PORT', sub: 'IR WINDOW', anchor: a.glassPort },
      ],
      arm: [
        { title: 'ROOT ACTUATOR', sub: 'ARM R2 · 3 DOF', anchor: arm.root },
        { title: 'GLASS LINK', sub: 'GEAR TRAIN', anchor: arm.link },
        { title: 'SPIRAL TIP', sub: `${this.arms.links.length} LINKS`, anchor: arm.tip },
      ],
      optics: [
        { title: 'OPTIC L', sub: '52 MM LENS', anchor: a.eyeL },
        { title: 'OPTIC R', sub: 'IR RIM · 6-BLADE IRIS', anchor: a.eyeR },
      ],
      beak: [
        { title: 'TWIN JAW', sub: 'CHITIN COMPOSITE', anchor: a.jaw },
        { title: 'RADULA RING', sub: '16 TEETH', anchor: a.radula },
        { title: 'BEAK HUB', sub: 'SEALED BEARING', anchor: a.hub },
      ],
      siphon: [
        { title: '6-FLAP NOZZLE', sub: 'VECTORED', anchor: a.nozzle },
        { title: 'SLEEVES', sub: '3 STAGES · TELESCOPIC', anchor: a.sleeves },
        { title: 'JET WAKE', sub: '1.8 HZ PULSE', anchor: a.wake },
      ],
    };
  }

  // s: 台本の状態、d: 表示の切り替え(exploded / wake / spin / soft)、
  // dt: 前のコマからの秒(腕のやわらかさを進める。0 なら止める)、reset: 腕のやわらかさを今の形に合わせ直す、
  // camera: 目が追うカメラ、draw: 描く準備までするか(助走では腕の計算だけ)
  update(s, d, { dt = 0, reset = false, camera = null, draw = true } = {}) {
    const t = s.t;
    const ex = d.exploded;
    // 体の位置と向きは sim/swim.js(泳ぐ道・漂い・台本の向き)。回転台はその上から縦の軸で回す
    bodyPoseAt(t, this.group.position, this.group.quaternion);
    if (d.spin) this.group.quaternion.premultiply(qSpin.setFromAxisAngle(Y, d.spin));
    this.group.updateMatrixWorld(true);
    // 胴は硬い殻なので伸び縮みさせない(2026-11-03 ユーザーの指示)。噴射の脈は、泳ぐ速さ(swim.js)と腕の開き閉じに出す
    const pulse = pulseAt(t);
    if (draw) {
      const look = camera ? this.group.worldToLocal(v.copy(camera.position)) : null;
      this.body.update(t, s.mantleOpen, s.opticsScan, ex, look);
      this.core.update(t, Math.max(s.mantleOpen, ex), s.jet);
      this.beak.update(t, Math.max(s.beakOpen, ex * 0.5));
      this.siphon.update(t, s.siphonOpen, jetAt, d.wake, this.bodyMatrixAt);
    }
    const o = { apart: s.armApart, exploded: ex, jet: s.jet, pulse, windup: s.windup, flare: s.flare, soft: d.soft };
    this.arms.update(t, poseAt, o, this.group.matrixWorld, dt, reset, draw);
  }
}
