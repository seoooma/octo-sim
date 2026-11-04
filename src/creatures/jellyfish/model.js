import * as THREE from 'three';
import { makeMaterials } from '../../materials.js';
import { buildBell, PLATES, CLOSE } from './bell.js';
import { Tentacles, NODES, COUNT, NET_RINGS } from './tentacles.js';
import { OralArms, LINKS } from './oral.js';
import { makeLumenMaterial } from './lumen.js';
import { bodyPoseAt } from './swim.js';

const Y = new THREE.Vector3(0, 1, 0);
const qSpin = new THREE.Quaternion();

// クラゲのロボット(Benthos JL-1)。傘(bell.js)は体と一緒に動き、触手と口腕は世界の座標で毎コマ作る(なびきは時刻だけで決まる)。
export class Jellyfish {
  constructor() {
    const m = (this.materials = makeMaterials());
    this.lumen = makeLumenMaterial();
    this.group = new THREE.Group();     // 傘(位置と向き。回転台はこの向きを回す)
    this.world = new THREE.Group();     // 触手と口腕(世界の座標)。main.js がシーンに足す
    this.focus = new THREE.Vector3();   // カメラが追う点(傘の中心)
    this.bell = buildBell(m, this.lumen);
    this.group.add(this.bell.group);
    this.tentacles = new Tentacles(m, this.lumen);
    this.oral = new OralArms(m);
    this.world.add(this.tentacles.group, this.oral.group);
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    const a = this.bell.anchors;
    const ta = this.tentacles.anchors;
    const oa = this.oral.anchors;
    this.labelSets = {
      drift: [
        { title: 'BELL', sub: `${PLATES} PLATES · IRIS OVERLAP`, anchor: a.plate },
        { title: 'TENTACLES', sub: `${COUNT} × ${NODES} LINKS`, anchor: ta.tentacle },
      ],
      pulse: [
        { title: 'HINGE RING', sub: `${PLATES} KNUCKLES`, anchor: a.hinge },
        { title: 'BELL PLATE', sub: `STROKE ${CLOSE.toFixed(2)} RAD`, anchor: a.plate },
        { title: 'RIM LIP', sub: 'MARGIN SEAL', anchor: a.lip },
      ],
      net: [
        { title: 'TENTACLE', sub: `${NODES} LINKS · TAPERED`, anchor: ta.tentacle },
        { title: 'NET STRAND', sub: `${COUNT * NET_RINGS.length} STRANDS`, anchor: ta.net },
        { title: 'STING NODE', sub: 'PHOTOPHORE BEAD', anchor: ta.node },
      ],
      oral: [
        { title: 'ORAL ARM', sub: `4 × ${LINKS} LINKS`, anchor: oa.arm },
        { title: 'FRILL PLATE', sub: `RUFFLED · ${4 * LINKS * 2}`, anchor: oa.frill },
        { title: 'MOUTH HUB', sub: 'MANUBRIUM', anchor: a.hub },
      ],
      lumen: [
        { title: 'PHOTOPHORE', sub: `${PLATES} · RIM RING`, anchor: a.sensor },
        { title: 'LUMEN LINE', sub: 'RADIAL WAVE', anchor: a.strip },
        { title: 'APICAL EYE', sub: 'LIGHT SENSOR', anchor: a.apical },
      ],
      open: [
        { title: 'GYRO CORE', sub: '3-AXIS GIMBAL', anchor: a.gyro },
        { title: 'PUMP RING', sub: `${PLATES} ACTUATORS`, anchor: a.pump },
        { title: 'GLASS DOME', sub: 'SUBUMBRELLA', anchor: a.dome },
      ],
    };
  }

  // 引き出し線を外へ広げる中心(世界の座標)
  center(out) {
    return this.group.localToWorld(out.set(0, -0.5, 0));
  }

  // s: 台本の状態、d: 表示の切り替え(labels / glow / drift / turntable、spin)。
  // 前のコマに頼らないので、助走(draw = false)では何もしない
  update(s, d, { draw = true } = {}) {
    if (!draw) return;
    const t = s.t;
    bodyPoseAt(t, this.group.position, this.group.quaternion);
    if (d.spin) this.group.quaternion.premultiply(qSpin.setFromAxisAngle(Y, d.spin));
    this.bell.update(t, s);
    this.group.updateMatrixWorld(true);
    this.tentacles.update(t, this.bell, this.group.matrixWorld, d.spin ?? 0, d.drift);
    this.oral.update(t, this.group.matrixWorld, d.spin ?? 0, d.drift);
    // 光: 縁の点はふだんかすかに、光の波の操作で強く、驚いたときに点滅
    const u = this.lumen.userData.uniforms;
    const glow = d.glow ? 1 : 0;
    u.uTime.value = t;
    u.uWave.value = s.lumen * glow;
    u.uIdle.value = glow;
    u.uFlash.value = s.flash * glow;
    this.materials.eyeRim.emissiveIntensity = glow * (0.15 + 1.2 * s.lumen * (0.6 + 0.4 * Math.sin(t * 4)) + 1.5 * s.flash);
    this.focus.copy(this.group.position);
  }
}
