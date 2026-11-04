import * as THREE from 'three';
import { velAt, quatAt } from './swim.js';
import { plateAngleAt, PLATES } from './bell.js';
import { netAt, partAt } from './timeline.js';
import { smoothstep, clamp } from '../../util.js';

// 触手 16 本(傘の板の縁に 1 本ずつ)。細い節の連なりで、伸び縮みはしない(節の長さは決まっている)。
// なびき: 付け根から先へ行くほど「少し前の時刻」の水の流れに向く。前のコマに頼らず時刻だけで決まる。
//   向き = 付け根の向き(その時刻の板の向き)→ 先へ行くほど、流れの向き(下へ垂れる + 体の速さの逆 + 少し外へ)
//   沈むときは先が上へなびき、昇るときは下へ流れ、止まると垂れる。打ちの波は付け根から先へ遅れて伝わる
export const COUNT = PLATES;
export const NODES = 30;
export const LEN = 2.75;
const DS = LEN / NODES;
const C_BASE = 3.0;      // 付け根の向きが先へ伝わる速さ(単位/秒)
const C_FLOW = 1.5;      // 流れの向きが先へ伝わる速さ
const GRAVITY = 1.0;     // 垂れる強さ
const DRAG = 0.85;       // 体の速さの逆へ流される強さ
const SPREAD = 0.35;     // 少し外へ
const BULGE = 0.9;       // 付け根の向きと流れの向きが逆のとき(沈むとき)、外へふくらんで回る強さ
const R0 = 0.036, R1 = 0.012;   // 付け根と先の太さ
export const BEAD_EVERY = 5;   // 光る帯(刺胞の電池)を置く節の間隔
export const NET_RINGS = [9, 14, 19, 24];   // 網の糸を張る節

export const radiusAt = (u) => R0 + (R1 - R0) * u;

const Y = new THREE.Vector3(0, 1, 0);

export class Tentacles {
  constructor(m, lumenMat) {
    this.group = new THREE.Group();
    // 節: 白い殻の筒(両端を少し丸める)と、そのつなぎ目の暗い襟
    const seg = new THREE.CylinderGeometry(1, 1, 1, 10, 4);
    {
      const pos = seg.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const k = 1 - 0.28 * (2 * Math.abs(y)) ** 3;   // 端へ向けて細く(丸い節に見せる)
        pos.setX(i, pos.getX(i) * k);
        pos.setZ(i, pos.getZ(i) * k);
      }
      seg.computeVertexNormals();
    }
    const joint = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
    const beadCount = COUNT * Math.floor((NODES - 1) / BEAD_EVERY);
    this.segMesh = new THREE.InstancedMesh(seg, m.shell, COUNT * NODES);
    this.jointMesh = new THREE.InstancedMesh(joint, m.metal, COUNT * NODES);   // 襟は明るい金属(暗いと点線に見える)
    // 光る帯(刺胞の電池): 節のつなぎ目の太い輪。触手の先へ流れる光の波を受ける
    const beadGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1);
    const lum = new Float32Array(beadCount * 3);
    let bi = 0;
    for (let k = 0; k < COUNT; k++) {
      for (let i = BEAD_EVERY; i < NODES; i += BEAD_EVERY) {
        lum.set([1 + (i / NODES) * 1.1, k / COUNT, 2], bi * 3);
        bi++;
      }
    }
    beadGeo.setAttribute('aLumen', new THREE.InstancedBufferAttribute(lum, 3));
    this.beadMesh = new THREE.InstancedMesh(beadGeo, lumenMat, beadCount);
    // 網の糸(となりの触手の節どうし)
    this.netCount = COUNT * NET_RINGS.length;
    this.netMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5, 1), m.darkMetal, this.netCount);
    this.meshes = [this.segMesh, this.jointMesh, this.beadMesh, this.netMesh];
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    // 節の位置(世界の座標)。網・計器・引き出し線も読む
    this.P = new Float32Array(COUNT * (NODES + 1) * 3);
    this.spread = new Float32Array(COUNT);   // 先が体の軸からどれだけ離れたか(0〜1)
    this.netBuilt = 0;
    this.anchors = { tentacle: new THREE.Object3D(), node: new THREE.Object3D(), net: new THREE.Object3D() };
    for (const a of Object.values(this.anchors)) this.group.add(a);
    // 作業用
    this.v = {
      p: new THREE.Vector3(), d: new THREE.Vector3(), d0: new THREE.Vector3(), f: new THREE.Vector3(), fn: new THREE.Vector3(),
      vel: new THREE.Vector3(), rad: new THREE.Vector3(), tng: new THREE.Vector3(), down: new THREE.Vector3(), mid: new THREE.Vector3(),
      q1: new THREE.Quaternion(), q2: new THREE.Quaternion(), qp: new THREE.Quaternion(), qs: new THREE.Quaternion(), q: new THREE.Quaternion(),
      sc: new THREE.Vector3(), m: new THREE.Matrix4(), a: new THREE.Vector3(), b: new THREE.Vector3(), axis: new THREE.Vector3(),
    };
  }

  // t: 時刻、bell: 傘(板の付け根)、body: 体の行列(世界)、spin: 回転台の回り(縦の軸)、soft: なびかせるか
  update(t, bell, body, spin, soft) {
    const V = this.v;
    const { p, d, d0, f, fn, vel, rad, tng, down, mid, q1, q2, qp, qs, q, sc, m } = V;
    qs.setFromAxisAngle(Y, spin);
    const net = netAt(t);
    const part = partAt(t);
    V.axis.set(0, 1, 0).applyMatrix4(m.extractRotation(body)).normalize();
    const bodyPos = V.a.setFromMatrixPosition(body);
    let si = 0, ji = 0, bi = 0;
    for (let k = 0; k < COUNT; k++) {
      const pl = bell.plates[k];
      // 付け根: 今の板の縁(世界)
      p.copy(pl.tip).applyQuaternion(pl.pivot.quaternion).add(pl.hinge).applyMatrix4(body);
      const base = k * (NODES + 1) * 3;
      p.toArray(this.P, base);
      const phase = k * 2.399;   // 黄金角でずらす(となりと同じ揺れにならない)
      for (let i = 0; i < NODES; i++) {
        const s = (i + 0.5) * DS;
        const u = s / LEN;
        const t1 = soft ? t - s / C_BASE : t;
        const t2 = soft ? t - s / C_FLOW : t;
        // 付け根の向き: その時刻の板の向きから出る
        quatAt(t1, q1).premultiply(qs);
        bell.plateQuat(pl, plateAngleAt(t1, k), qp);
        d0.copy(pl.down).applyQuaternion(qp).applyQuaternion(q1);
        // 流れの向き: 垂れる + 体の速さの逆 + 少し外へ
        quatAt(t2, q2).premultiply(qs);
        velAt(t2, vel);
        rad.set(Math.sin(pl.phi), 0, Math.cos(pl.phi)).applyQuaternion(q2);
        f.set(0, -GRAVITY, 0).addScaledVector(vel, -DRAG).addScaledVector(rad, SPREAD + 0.9 * part).normalize();
        // 網: 外へ大きく広げ、先は少し垂れる(体の向きで)
        const nk = clamp(net * 1.15 - 0.15 * ((k * 5) % COUNT) / COUNT);
        if (nk > 0) {
          down.set(0, -1, 0).applyQuaternion(q2);
          fn.copy(rad).multiplyScalar(1 - 0.45 * u).addScaledVector(down, 0.32 + 0.6 * u).normalize();
          f.lerp(fn, smoothstep(0, 1, nk)).normalize();
        }
        // 付け根の向きから流れの向きへ回す。逆向きに近いときは外へふくらませて、大きな弧で回す(きつい U にしない)
        const w = smoothstep(0, 0.9, s);
        const opp = Math.max(0, -d0.dot(f));
        d.copy(d0).lerp(f, w).addScaledVector(rad, BULGE * opp * 4 * w * (1 - w)).normalize();
        // ゆるいうねり(先ほど大きい。網を張っているあいだは小さく)
        const amp = (0.12 + 0.5 * u) * u * (1 - 0.65 * net);
        tng.crossVectors(V.axis, rad).normalize();
        d.addScaledVector(tng, amp * Math.sin(1.25 * t - 2.4 * s + phase))
          .addScaledVector(rad, amp * 0.45 * Math.sin(0.83 * t - 1.7 * s + 1.7 * phase))
          .normalize();
        // 節: p から d へ DS だけ進む
        const r = radiusAt(u);
        mid.copy(p).addScaledVector(d, DS / 2);
        q.setFromUnitVectors(Y, d);
        this.segMesh.setMatrixAt(si++, m.compose(mid, q, sc.set(r, DS * 0.96, r)));
        p.addScaledVector(d, DS);
        p.toArray(this.P, base + (i + 1) * 3);
        // つなぎ目: 暗い襟(薄い輪)。BEAD_EVERY ごとに太い光る帯
        const rj = radiusAt((i + 1) / NODES);
        if ((i + 1) % BEAD_EVERY === 0 && i + 1 < NODES) {
          this.beadMesh.setMatrixAt(bi++, m.compose(p, q, sc.set(rj * 1.55, DS * 0.42, rj * 1.55)));
          this.jointMesh.setMatrixAt(ji++, m.makeScale(0, 0, 0));
        } else if (i + 1 < NODES) {
          this.jointMesh.setMatrixAt(ji++, m.compose(p, q, sc.set(rj * 1.12, DS * 0.13, rj * 1.12)));
        } else {
          // 先: 小さな暗い玉
          this.jointMesh.setMatrixAt(ji++, m.compose(p, q, sc.set(rj * 1.3, rj * 1.3, rj * 1.3)));
        }
      }
      // 先が体の軸からどれだけ離れたか(計器)
      V.b.fromArray(this.P, base + NODES * 3).sub(bodyPos);
      const along = V.b.dot(V.axis);
      this.spread[k] = clamp(Math.sqrt(Math.max(0, V.b.lengthSq() - along * along)) / LEN);
    }
    // 網の糸: となりの触手の同じ節へ、少しずつ伸ばして張る
    let ni = 0;
    this.netBuilt = 0;
    NET_RINGS.forEach((n, r) => {
      for (let k = 0; k < COUNT; k++) {
        const g = clamp(net * 1.6 - 0.35 * (r / NET_RINGS.length) - 0.25 * (k / COUNT));
        const A = V.a.fromArray(this.P, (k * (NODES + 1) + n) * 3);
        const B = V.b.fromArray(this.P, (((k + 1) % COUNT) * (NODES + 1) + n) * 3);
        if (g < 0.01) {
          this.netMesh.setMatrixAt(ni++, m.makeScale(0, 0, 0));
          continue;
        }
        if (g > 0.99) this.netBuilt++;
        d.subVectors(B, A);
        const len = d.length() * g;
        d.normalize();
        mid.copy(A).addScaledVector(d, len / 2);
        q.setFromUnitVectors(Y, d);
        this.netMesh.setMatrixAt(ni++, m.compose(mid, q, sc.set(0.0085, len, 0.0085)));
      }
    });
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
    // 引き出し線の付け根(正面寄りの触手の途中・光る玉・網の糸)
    const at = (k, n, out) => out.position.fromArray(this.P, (k * (NODES + 1) + n) * 3);
    at(3, 11, this.anchors.tentacle);
    at(13, 10, this.anchors.node);
    V.a.fromArray(this.P, (0 * (NODES + 1) + 14) * 3);
    V.b.fromArray(this.P, (1 * (NODES + 1) + 14) * 3);
    this.anchors.net.position.copy(V.a).lerp(V.b, 0.5);
  }
}
