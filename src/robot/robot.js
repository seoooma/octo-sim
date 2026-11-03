import * as THREE from 'three';
import { makeMaterials } from './materials.js';
import { buildBody } from './body.js';
import { buildCore } from './core.js';
import { buildBeak } from './beak.js';
import { buildSiphon } from './siphon.js';
import { Arms } from './arms.js';
import { jetAt } from '../sim/timeline.js';

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

  // s: 台本の状態、d: 表示の切り替え(exploded / wake / turntable)
  update(s, d) {
    const t = s.t;
    const ex = d.exploded;
    this.group.position.fromArray(s.pos);
    this.group.position.y += 0.05 * Math.sin(t * 0.8);
    this.group.rotation.set(s.rot[0], s.rot[1] + d.spin, s.rot[2]);
    this.body.update(t, s.mantleOpen, s.opticsScan, ex);
    this.core.update(t, Math.max(s.mantleOpen, ex), s.jet);
    this.beak.update(t, Math.max(s.beakOpen, ex * 0.5));
    this.siphon.update(t, s.siphonOpen, jetAt, d.wake);
    this.arms.update(t, s.pose, s.armApart, ex);
  }
}
