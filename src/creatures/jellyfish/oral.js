import * as THREE from 'three';
import { velAt, quatAt } from './swim.js';
import { HUB_Y, ORAL_BASE_R } from './bell.js';
import { oralAt } from './timeline.js';
import { smoothstep } from '../../util.js';

// 口腕 4 本: 傘の真ん中の口の台から下がる、小さな板の連なり。板の両わきに波打つふち飾り(フリル)が付く。
// なびき方は触手と同じ(先ほど少し前の時刻の流れに向く)が、重いのでゆっくり。フリルは鎖に沿って少しずつねじれ、波打つ。
// 口腕の操作(ORAL ARMS)では外へ広げて先を上へ巻き、フリルを大きく開く
export const ARMS = 4;
export const LINKS = 16;
const LEN = 2.1;
const DS = LEN / LINKS;
const C_BASE = 2.2, C_FLOW = 1.0;
const W0 = 0.22, W1 = 0.09;   // フリルの幅(付け根と先)
const Y = new THREE.Vector3(0, 1, 0);

// フリル 1 枚の形: 鎖から外へ(+x)出る板。外の縁は波形、全体が少し波打つ(y が鎖に沿う向き)
function frillGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.5);
  shape.lineTo(0.62, -0.5);
  const bumps = 3;
  for (let i = 0; i < bumps; i++) {
    const y0 = -0.5 + i / bumps, y1 = -0.5 + (i + 1) / bumps;
    shape.quadraticCurveTo(1.12, (y0 + y1) / 2, 0.62, y1);
  }
  shape.lineTo(0, 0.5);
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape, 6);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, 0.16 * x * x * Math.sin(Math.PI * 2 * y * 1.5));
  }
  g.computeVertexNormals();
  return g;
}

export class OralArms {
  constructor(m) {
    this.group = new THREE.Group();
    const n = ARMS * LINKS;
    const body = new THREE.SphereGeometry(1, 14, 8);
    body.scale(1, 1, 0.62);
    this.linkMesh = new THREE.InstancedMesh(body, m.shell, n);
    this.beadMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), m.darkMetal, n);
    const fg = frillGeometry();
    const orange = (j) => j % 4 === 2;
    this.orangeCount = ARMS * [...Array(LINKS).keys()].filter(orange).length * 2;
    this.frillMesh = new THREE.InstancedMesh(fg, m.shellDS, n * 2 - this.orangeCount);
    this.frillOrange = new THREE.InstancedMesh(fg, m.orange, this.orangeCount);
    this.isOrange = orange;
    this.meshes = [this.linkMesh, this.beadMesh, this.frillMesh, this.frillOrange];
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.anchors = { arm: new THREE.Object3D(), frill: new THREE.Object3D() };
    for (const a of Object.values(this.anchors)) this.group.add(a);
    this.reach = new Float32Array(ARMS);   // 先の広がり(計器)
    this.v = {
      p: new THREE.Vector3(), d: new THREE.Vector3(), d0: new THREE.Vector3(), f: new THREE.Vector3(), vel: new THREE.Vector3(),
      rad: new THREE.Vector3(), up: new THREE.Vector3(), e1: new THREE.Vector3(), e2: new THREE.Vector3(), fx: new THREE.Vector3(),
      fz: new THREE.Vector3(), mid: new THREE.Vector3(), base: new THREE.Vector3(), axis: new THREE.Vector3(),
      q1: new THREE.Quaternion(), q2: new THREE.Quaternion(), qs: new THREE.Quaternion(), q: new THREE.Quaternion(),
      sc: new THREE.Vector3(), m: new THREE.Matrix4(),
    };
  }

  update(t, body, spin, soft) {
    const V = this.v;
    const { p, d, d0, f, vel, rad, up, e1, e2, fx, fz, mid, q1, q2, qs, q, sc, m } = V;
    qs.setFromAxisAngle(Y, spin);
    const oral = oralAt(t);
    V.axis.set(0, 1, 0).applyMatrix4(m.extractRotation(body)).normalize();
    let li = 0, wi = 0, oi = 0;
    for (let j = 0; j < ARMS; j++) {
      const a = Math.PI / 4 + (j * Math.PI) / 2;
      const phase = j * 1.9;
      p.set(Math.sin(a) * ORAL_BASE_R, HUB_Y - 0.06, Math.cos(a) * ORAL_BASE_R).applyMatrix4(body);
      V.base.copy(p);
      for (let i = 0; i < LINKS; i++) {
        const s = (i + 0.5) * DS;
        const u = s / LEN;
        const t1 = soft ? t - s / C_BASE : t;
        const t2 = soft ? t - s / C_FLOW : t;
        quatAt(t1, q1).premultiply(qs);
        rad.set(Math.sin(a), 0, Math.cos(a)).applyQuaternion(q1);
        d0.set(0, -1, 0).applyQuaternion(q1).addScaledVector(rad, 0.18);
        quatAt(t2, q2).premultiply(qs);
        velAt(t2, vel);
        rad.set(Math.sin(a), 0, Math.cos(a)).applyQuaternion(q2);
        up.set(0, 1, 0).applyQuaternion(q2);
        // 流れ: 垂れる + 体の速さの逆 + 外へ(口腕の操作で大きく広げ、先を上へ巻く)
        f.set(0, -1.3, 0).addScaledVector(vel, -0.65).addScaledVector(rad, 0.18 + 1.25 * oral * (1 - 0.3 * u)).addScaledVector(up, oral * 1.9 * u * u).normalize();
        d.copy(d0).normalize().lerp(f, smoothstep(0, 0.5, s));
        // ゆっくりしたうねり
        const amp = (0.25 + 0.2 * oral) * u;
        e1.crossVectors(V.axis, rad).normalize();
        d.addScaledVector(e1, amp * Math.sin(0.9 * t - 2.6 * s + phase)).addScaledVector(rad, amp * 0.5 * Math.sin(0.7 * t - 2.0 * s + 2 * phase)).normalize();
        // 板(白)と、つなぎの玉(暗い金属)
        const r = 0.088 * (1 - 0.5 * u);
        mid.copy(p).addScaledVector(d, DS / 2);
        // 板の向き: 鎖の向き d、横 e1(鎖に直交)。鎖に沿ってねじれる
        e1.crossVectors(d, rad);
        if (e1.lengthSq() < 1e-6) e1.crossVectors(d, up);
        e1.normalize();
        e2.crossVectors(d, e1);
        const twist = 1.15 * s + 0.35 * Math.sin(1.3 * t - 2.4 * s + phase) + j * 0.4;
        fx.copy(e1).multiplyScalar(Math.cos(twist)).addScaledVector(e2, Math.sin(twist));   // 板の横
        fz.crossVectors(fx, d);
        m.makeBasis(fx, d, fz).scale(sc.set(r, DS * 0.48, r)).setPosition(mid);
        this.linkMesh.setMatrixAt(li, m);
        this.beadMesh.setMatrixAt(li, m.compose(p, q.identity(), sc.setScalar(r * 0.55)));
        li++;
        // フリル 2 枚: 板の両わきから、少し下(腹側)へ傾けて出す。開き具合は波打つ
        const fold = 0.55 + 0.75 * oral + 0.22 * Math.sin(3.2 * t - 5.5 * s + phase);
        const w = (W0 + (W1 - W0) * u) * (1 + 0.25 * oral);
        for (const side of [1, -1]) {
          // 外へ出る向き: 横 fx を、鎖のまわりに fold だけ fz の側へ倒す
          const ca = Math.cos(Math.PI / 2 - fold), sa = Math.sin(Math.PI / 2 - fold);
          e2.copy(fx).multiplyScalar(side * ca).addScaledVector(fz, sa);   // 板の外向き
          e1.crossVectors(e2, d);                                         // 板の法線
          m.makeBasis(e2, d, e1).scale(sc.set(w, DS * 1.05, w)).setPosition(mid);
          if (this.isOrange(i)) this.frillOrange.setMatrixAt(oi++, m);
          else this.frillMesh.setMatrixAt(wi++, m);
        }
        p.addScaledVector(d, DS);
        if (j === 1 && i === 9) this.anchors.arm.position.copy(p);
        if (j === 2 && i === 5) this.anchors.frill.position.copy(mid).addScaledVector(fx, -w);
      }
      p.sub(V.base);
      const along = p.dot(V.axis);
      this.reach[j] = Math.min(1, Math.sqrt(Math.max(0, p.lengthSq() - along * along)) / LEN);
    }
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }
}
