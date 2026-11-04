import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeMaterials } from '../../materials.js';
import { plates, rivets, makeEye, segment, place, buildLeg, poseLeg } from '../../core/limbs.js';
import { smoothstep } from '../../util.js';
import {
  LEGS, SEG, LEG_SIZE, PROSOMA, PRO_THETA, MESOSOMA, MESO_THETA, TERGITES, TAIL_BASE, TAIL_LEN, TAIL_W, TAIL_H, TELSON,
  PALP, PALP_HIP, HAND, BOX, T,
} from './layout.js';
import { bodyPoseAt, footAt } from './path.js';
import { tailAt, stingGlowAt } from './tail.js';
import { clawFrameAt, boxPoseAt } from './claws.js';
import { horn, band, tergite, bandPoint, ellipsoid } from './shapes.js';

// サソリのロボット(Benthos SC-8)。体の座標: 頭が +z、背中が +y、左が +x。
// 体の位置と向き・足の位置・尾の角度・はさみの形は path.js / tail.js / claws.js(時刻だけで決まる)。
// ここは形を作って、毎コマその角度に置く。硬い殻は伸び縮みさせない(関節・蝶番の回転だけ)。

const UV_COLOR = 0x3cf0c4;   // 紫外線で光る殻の継ぎ目(青緑)
const UV_ZONES = 1 + TERGITES + 6;   // 頭胸部・背板 7 枚・尾の 5 節と末節
const TMP = new THREE.Vector3();

export class Scorpion {
  constructor() {
    const m = (this.materials = makeMaterials());
    // 紫外線で光る継ぎ目の材質(前から後ろへ、光の帯が流れるので場所ごとに分ける)
    this.uv = Array.from({ length: UV_ZONES }, () => new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.55, emissive: UV_COLOR, emissiveIntensity: 0 }));
    m.lamp = new THREE.MeshStandardMaterial({ color: 0x24252a, roughness: 0.2, emissive: 0x8d5bff, emissiveIntensity: 0 });
    m.venom = new THREE.MeshStandardMaterial({ color: 0xef5b2b, roughness: 0.35, emissive: 0xff5a1f, emissiveIntensity: 0 });
    this.group = new THREE.Group();     // 回転台で回すのはこれ(箱ごと)
    this.world = new THREE.Group();     // main.js がシーンに足す(使わない)
    this.focus = new THREE.Vector3();
    const anchors = (this.anchors = {});
    const P = new THREE.Vector3();
    const anchor = (parent, x, y, z) => {
      const o = new THREE.Object3D();
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };

    // ---- 体
    const body = (this.body = new THREE.Group());
    this.group.add(body);
    this.buildProsoma(body, m, anchors, anchor);
    this.buildMesosoma(body, m, anchors, anchor);
    this.buildTail(body, m, anchors, anchor);

    // ---- 歩く脚(8 本 × 3 節)。this.group の座標で置く
    this.legs = LEGS.map((L) => ({ L, ...buildLeg(m, this.group, SEG, LEG_SIZE) }));
    const leg = this.legs[0];
    anchors.femur = anchor(leg.femur, 0.08, SEG[0] * 0.55, 0);
    anchors.claw = anchor(leg.tarsus, 0, SEG[2], 0);

    // ---- はさみ(触肢 2 本: 腿・膝の節・手)
    this.claws = [1, -1].map((s) => this.buildClaw(s, m, anchor));
    anchors.chela = this.claws[0].fingerTip;
    anchors.elbow = anchor(this.claws[0].patella, 0, 0.02, 0);
    anchors.chelaR = this.claws[1].fingerTip;

    // ---- 床の小さな箱(サンプルの入れ物)
    const box = (this.box = new THREE.Group());
    const [bw, bh, bd] = BOX.size;
    // 暗い箱に白いふたとオレンジの帯(白いはさみ・暖かい白の床の上で見分けがつくように)
    box.add(new THREE.Mesh(new RoundedBoxGeometry(bw, bh, bd, 3, 0.03), m.dark));
    const lid = new THREE.Mesh(new RoundedBoxGeometry(bw * 1.05, bh * 0.22, bd * 1.05, 2, 0.02), m.shell);
    lid.position.y = bh * 0.42;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(bw * 1.03, bh * 0.14, bd * 1.03), m.orange);
    strip.position.y = -bh * 0.05;
    const latch = new THREE.Mesh(new RoundedBoxGeometry(bw * 0.3, bh * 0.22, 0.03, 1, 0.008), m.darkMetal);
    latch.position.set(0, bh * 0.3, bd * 0.53);
    box.add(lid, strip, latch);
    anchors.box = anchor(box, 0, bh * 0.5, 0);
    this.group.add(box);

    this.group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    const a = anchors;
    this.labelSets = {
      walk: [
        { title: 'LEG DRIVE', sub: 'L1 · 3 JOINTS · HYDRAULIC', anchor: a.femur },
        { title: 'TARSAL CLAW', sub: 'SAND GRIP', anchor: a.claw },
        { title: 'METASOMA', sub: '5 HINGED SEGMENTS', anchor: a.t2 },
      ],
      threat: [
        { title: 'CHELA', sub: 'MOVABLE FINGER · SERVO', anchor: a.chela },
        { title: 'PATELLA JOINT', sub: 'PEDIPALP · 2 DOF', anchor: a.elbow },
        { title: 'MEDIAN EYES', sub: '2 LENSES · DORSAL', anchor: a.eyes },
      ],
      arch: [
        { title: 'T5 HINGE', sub: 'DORSAL FLEX · 40°', anchor: a.t5 },
        { title: 'TELSON', sub: 'VENOM VESICLE', anchor: a.bulb },
        { title: 'T1 SWIVEL', sub: 'YAW + PITCH', anchor: a.t1 },
      ],
      sting: [
        { title: 'ACULEUS', sub: 'INJECTOR TIP', anchor: a.tip },
        { title: 'VENOM VESICLE', sub: 'PRESSURISED SAC', anchor: a.bulb },
      ],
      uv: [
        { title: 'CUTICLE SEAMS', sub: 'UV REACTIVE · 7 JOINTS', anchor: a.seam },
        { title: 'TERGITES', sub: '7 OVERLAPPING PLATES', anchor: a.tergite },
        { title: 'UV EMITTER', sub: '365 NM', anchor: a.lamp },
      ],
      grip: [
        { title: 'CHELA R', sub: 'GRIP · 18 N', anchor: a.chelaR },
        { title: 'SAMPLE CASE', sub: '60 G', anchor: a.box },
        { title: 'CHELICERAE', sub: 'TWIN CUTTERS', anchor: a.chelicera },
      ],
    };

    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.up = new THREE.Vector3();
    this.tail = { yaw: 0, a: new Array(6).fill(0) };
    this.frame = {};
    this.tmpN = new THREE.Vector3();
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
  }

  // 頭胸部: 盾(左右 2 枚と真ん中の継ぎ目)・目・紫外線の灯・鋏角
  buildProsoma(body, m, anchors, anchor) {
    const E = PROSOMA;
    const [th0, th1] = PRO_THETA;
    const seam = 0.035;
    body.add(ellipsoid({ c: [0, -0.04, 0.18], r: [0.4, 0.15, 0.6] }, m.dark));
    // 盾: 左右 2 枚
    body.add(band(E, th0, th1, Math.PI - 0.38, 1.5 * Math.PI - seam, m.shell));
    body.add(band(E, th0, th1, 1.5 * Math.PI + seam, 2 * Math.PI + 0.38, m.shell));
    // 継ぎ目(真ん中の溝と、後ろの縁)
    body.add(band(E, th0 + 0.02, th1 - 0.02, 1.5 * Math.PI - seam - 0.01, 1.5 * Math.PI + seam + 0.01, this.uv[0], 0.985, 4, 8));
    body.add(band(E, th1 - 0.04, th1, Math.PI - 0.38, 2 * Math.PI + 0.38, this.uv[0], 1.006));
    // 前の縁のオレンジの線(控えめに)
    body.add(band(E, th0, th0 + 0.035, Math.PI - 0.1, 2 * Math.PI + 0.1, m.orange, 1.004));
    // リベット
    const pts = [];
    for (const th of [1.15, 1.55, 1.95]) for (const ph of [Math.PI - 0.2, 2 * Math.PI + 0.2]) pts.push(bandPoint(E, th, ph, new THREE.Vector3(), 1.01));
    body.add(rivets(pts, m, 0.013));

    // 真ん中の目(背中の小さな丘の上に 2 つ、左右の上を向く)
    const top = bandPoint(E, 1.3, 1.5 * Math.PI, new THREE.Vector3());
    const mound = ellipsoid({ c: [0, top.y + 0.005, top.z], r: [0.09, 0.06, 0.12] }, m.shell);
    body.add(mound);
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = makeEye(m, 0.042);
      e.position.set(s * 0.055, top.y + 0.04, top.z + 0.01);
      e.lookAt(e.position.clone().add(new THREE.Vector3(s, 0.7, 0.35)));
      body.add(e);
      this.eyes.push(e);
    }
    anchors.eyes = anchor(body, 0, top.y + 0.08, top.z);
    // 横の小さな目の組(前の両角に 3 つずつ)
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        bandPoint(E, th0 + 0.07 + i * 0.05, s > 0 ? Math.PI + 0.32 - i * 0.05 : 2 * Math.PI - 0.32 + i * 0.05, TMP, 1.0);
        const e = makeEye(m, 0.022 - i * 0.003);
        e.position.copy(TMP);
        e.lookAt(e.position.clone().add(new THREE.Vector3(s * 0.8, 0.25, 0.6)));
        body.add(e);
      }
    }
    // 紫外線の灯(前の縁の真ん中)
    const front = bandPoint(E, th0 + 0.04, 1.5 * Math.PI, new THREE.Vector3());
    const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 24), m.darkMetal);
    lampHousing.rotation.x = Math.PI / 2 - 0.25;
    lampHousing.position.set(0, front.y - 0.07, front.z + 0.03);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 10, 0, Math.PI * 2, 0, 1.3), m.lamp);
    lamp.rotation.x = Math.PI / 2 - 0.25;
    lamp.position.set(0, front.y - 0.07, front.z + 0.055);
    body.add(lampHousing, lamp);
    anchors.lamp = anchor(body, 0, front.y - 0.07, front.z + 0.09);
    // 鋏角: 前の下に 2 つの小さなはさみ
    this.chelicerae = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.075, -0.07, 0.7);
      const block = new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.07, 0.13, 2, 0.022), m.darkMetal);
      block.position.z = 0.05;
      const cap = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.02, 0.08, 1, 0.008), m.shell);
      cap.position.set(0, 0.038, 0.04);
      const tooth = new THREE.Mesh(horn(0.08, 0.02, 0.004, 0.9, 8, 6), m.darkMetal);
      tooth.rotation.set(Math.PI / 2, 0, -s * Math.PI / 2);
      tooth.position.set(s * 0.01, -0.01, 0.1);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), m.orange);
      tip.position.set(-s * 0.03, -0.01, 0.17);
      pivot.add(block, cap, tooth, tip);
      pivot.userData.side = s;
      body.add(pivot);
      return pivot;
    });
    anchors.chelicera = anchor(body, 0.1, -0.12, 0.86);
  }

  // 中体: 7 枚の重なる背板(前の板の後ろの縁が、次の板の上に少しかぶる)と、暗い腹
  buildMesosoma(body, m, anchors, anchor) {
    const E = MESOSOMA;
    const [a0, a1] = MESO_THETA;
    const d = (a1 - a0) / TERGITES;
    const PH0 = Math.PI - 0.42, PH1 = 2 * Math.PI + 0.42;
    body.add(ellipsoid({ c: [0, -0.04, E.c[2]], r: [E.r[0] * 0.93, 0.17, E.r[2] * 0.93] }, m.dark));
    const pts = [];
    const FLARE = 0.07;
    for (let k = 0; k < TERGITES; k++) {
      const s = 1 + 0.012 * (TERGITES - 1 - k);
      const t0 = a0 + k * d, t1 = a0 + (k + 1) * d + 0.03;
      body.add(tergite(E, t0, t1, PH0, PH1, m.shell, s, FLARE));
      // 後ろの縁の溝の継ぎ目(ふだんは暗い細い線、紫外線で光る)。背中の側だけ
      body.add(band(E, t1 - 0.01, t1 + 0.018, PH0 + 0.2, PH1 - 0.2, this.uv[1 + k], s * (1 + 0.3 * FLARE) + 0.003, 28, 2));
      // 真ん中の背骨の線と、両脇のリベット
      body.add(tergite(E, t0 + 0.03, t1 - 0.06, 1.5 * Math.PI - 0.018, 1.5 * Math.PI + 0.018, m.seam, s + 0.004, FLARE, 2, 6, t0, t1));
      for (const ph of [Math.PI - 0.15, 2 * Math.PI + 0.15]) pts.push(bandPoint(E, (t0 + t1) / 2, ph, new THREE.Vector3(), s * (1 + FLARE * 0.51) + 0.006));
      // 3 枚目と 5 枚目にオレンジの印(控えめに)
      if (k === 2 || k === 4) {
        for (const ph of [Math.PI + 0.42, 2 * Math.PI - 0.42]) {
          bandPoint(E, (t0 + t1) / 2, ph, TMP, s * (1 + FLARE * 0.51) + 0.006);
          const mark = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, 0.012), m.orange);
          mark.position.copy(TMP);
          mark.lookAt(TMP.x * 2, TMP.y * 2 - E.c[1], TMP.z);   // 外向き(楕円体の中心の軸から離れる向き)
          body.add(mark);
        }
      }
      if (k === 3) anchors.seam = anchor(body, 0, 0, 0), bandPoint(E, t1, 2 * Math.PI - 0.35, anchors.seam.position, s * (1 + FLARE * 0.3) + 0.01);
      if (k === 4) anchors.tergite = anchor(body, 0, 0, 0), bandPoint(E, (t0 + t1) / 2, 1.5 * Math.PI, anchors.tergite.position, s * (1 + FLARE * 0.51) + 0.01);
    }
    body.add(rivets(pts, m, 0.012));
  }

  // 尾: 付け根の首振り → 5 節(蝶番でつなぐ)→ 末節(毒の袋と針)
  buildTail(body, m, anchors, anchor) {
    const swivel = (this.swivel = new THREE.Group());
    swivel.position.fromArray(TAIL_BASE);
    body.add(swivel);
    // 付け根の回り台(暗い金属の輪)
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.1, 24), m.darkMetal);
    turret.position.set(0, -0.02, 0.06);
    swivel.add(turret);
    this.joints = [];
    let parent = swivel;
    for (let k = 0; k < 5; k++) {
      const j = new THREE.Group();
      if (k > 0) j.position.z = -TAIL_LEN[k - 1];
      parent.add(j);
      this.joints.push(j);
      const L = TAIL_LEN[k], w = TAIL_W[k], h = TAIL_H[k];
      // 蝶番(横向きの暗い筒とオレンジの軸の頭)
      const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.36, h * 0.36, w * 1.02, 20), m.darkMetal);
      knuckle.rotation.z = Math.PI / 2;
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.18, h * 0.18, w * 1.16, 14), m.orange);
      pin.rotation.z = Math.PI / 2;
      j.add(knuckle, pin);
      // 殻(角の丸い箱)・前の継ぎ目の輪(紫外線で光る)・背中の 2 本の稜線
      const shell = new THREE.Mesh(new RoundedBoxGeometry(w, h, L - 0.05, 3, Math.min(w, h) * 0.32), m.shell);
      shell.position.z = -L / 2 - 0.005;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 8, 32), this.uv[1 + TERGITES + k]);
      ring.scale.set(w * 0.5, h * 0.5, 0.5);
      ring.position.z = -0.06;
      j.add(shell, ring);
      for (const s of [-1, 1]) {
        const keel = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, L * 0.62), m.seam);
        keel.position.set(s * w * 0.2, h * 0.5 + 0.002, -L / 2);
        j.add(keel);
      }
      parent = j;
      if (k === 0) anchors.t1 = anchor(j, w * 0.5, 0, -0.02);
      if (k === 1) anchors.t2 = anchor(j, 0, h * 0.5, -L * 0.5);
      if (k === 4) anchors.t5 = anchor(j, w * 0.55, 0, 0);
    }
    // 末節: 蝶番 → 毒の袋(白い板)→ 曲がった針(暗い金属、先がオレンジに光る)
    const tel = new THREE.Group();
    tel.position.z = -TAIL_LEN[4];
    parent.add(tel);
    this.joints.push(tel);
    const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.25, 20), m.darkMetal);
    knuckle.rotation.z = Math.PI / 2;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.29, 14), m.orange);
    pin.rotation.z = Math.PI / 2;
    tel.add(knuckle, pin);
    const [bx, by, bz] = TELSON.bulb;
    const bulb = { c: [0, 0, -0.04 - bz], r: [bx, by, bz] };
    tel.add(plates(bulb, m, { bands: 3, segs: 6, axis: 'z', seam: 0.03 }));
    const venomRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 32), m.venom);
    venomRing.scale.set(bx * 1.0, by * 1.0, 0.6);
    venomRing.position.z = bulb.c[2] - bz * 0.15;
    tel.add(venomRing);
    const uvCap = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 8, 32), this.uv[UV_ZONES - 1]);
    uvCap.scale.set(bx * 0.72, by * 0.72, 0.5);
    uvCap.position.z = -0.05;
    tel.add(uvCap);
    anchors.bulb = anchor(tel, bx, 0, bulb.c[2]);
    // 針: 袋の後ろから、尾の曲がる向き(上 +y)へ反る。先の 3 割は光る材質を重ねる
    const SL = 0.3, SB = 0.9;
    const sting = new THREE.Group();
    sting.position.z = bulb.c[2] - bz * 0.7;
    sting.rotation.x = -Math.PI / 2;   // 角の +y を -z へ(曲がりの +z は +y へ)
    sting.add(new THREE.Mesh(horn(SL, 0.05, 0.004, SB, 14, 12), m.darkMetal));
    const R = SL / SB;
    const arc = (u, o) => o.set(0, R * Math.sin(SB * u), R * (1 - Math.cos(SB * u)));
    const tip = new THREE.Mesh(horn(SL * 0.32, 0.02, 0.003, SB * 0.32, 10, 4), m.venom);
    arc(0.68, tip.position);
    tip.rotation.x = SB * 0.68;
    sting.add(tip);
    tel.add(sting);
    anchors.tip = anchor(sting, 0, 0, 0);
    arc(1, anchors.tip.position);
    this.stingTip = anchors.tip;
  }

  // はさみ 1 本(s: 1 が左、-1 が右)。腿と膝の節は脚と同じ節、手は板の殻と 2 本の指
  buildClaw(s, m, anchor) {
    const femur = segment(m, PALP[0], { shell: [0.07, 0.062], joint: 0.07, band: true });
    const patella = segment(m, PALP[1], { shell: [0.085, 0.072], joint: 0.075, piston: true });
    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 18, 10), m.darkMetal);
    const hand = new THREE.Group();
    this.group.add(femur, patella, hip, hand);
    // 手首の玉
    hand.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 18, 10), m.darkMetal));
    // 手(ふくらんだ殻。前後の軸 = z)
    const manus = { c: [s * 0.01, 0, 0.05 + HAND.len / 2 - 0.02], r: [0.165, 0.125, HAND.len / 2] };
    hand.add(plates(manus, m, { bands: 3, segs: 6, axis: 'z', seam: 0.025 }));
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 8, 32), m.orange);
    cuff.scale.set(manus.r[0] * 0.78, manus.r[1] * 0.78, 0.4);
    cuff.position.z = 0.12;
    hand.add(cuff);
    // 指: 内側の動かない指と、外側の動く指(蝶番は縦 = 手の +y)。どちらも +z へ伸び、先が内へ曲がる
    const fz = 0.05 + HAND.len - 0.07;
    const finger = (r0) => {
      const g = new THREE.Group();
      const f = new THREE.Mesh(horn(HAND.finger, r0, 0.012, 0.5, 12, 10), m.shell);
      f.rotation.x = Math.PI / 2;   // +y を +z へ。曲がり(+z 側)は -y へ向くので、z のまわりに回して内へ
      const holder = new THREE.Group();
      holder.add(f);
      g.add(holder);
      // 内側の歯(暗い小さな角)
      for (let i = 0; i < 4; i++) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 6), m.darkMetal);
        tooth.position.set(0, 0, 0.06 + i * 0.06);
        holder.add(tooth);
      }
      const tipCap = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 6), m.orange);
      holder.add(tipCap);
      return { g, holder, teeth: holder.children.slice(1, 5), tipCap };
    };
    const fixed = finger(0.05);
    fixed.g.position.set(-s * 0.06, 0, fz);
    const moving = finger(0.055);
    const hinge = new THREE.Group();
    hinge.position.set(s * 0.09, 0, fz - 0.02);
    hinge.add(moving.g);
    const hingePin = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 16), m.darkMetal);
    const hingeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.13, 12), m.orange);
    hinge.add(hingePin, hingeCap);
    hand.add(fixed.g, hinge);
    // 指の曲がりを内へ向ける: 角は +y へ伸びて +z 側へ曲がる → x の回りに +90° で +z へ伸び、曲がりは -y 側。
    // さらに z のまわりに回して、曲がりを内(動く指は -s、動かない指は +s)へ
    const aim = (fg, inward) => {
      fg.holder.rotation.z = inward > 0 ? Math.PI / 2 : -Math.PI / 2;
      // 歯と先の玉: 角の弧に沿って置く(角の座標で計算して、holder の中の f と同じ回転を当てる)
      const f = fg.holder.children[0];
      const R = HAND.finger / 0.5;
      const pt = (u, out) => out.set(0, R * Math.sin(0.5 * u), R * (1 - Math.cos(0.5 * u))).applyEuler(f.rotation);
      fg.teeth.forEach((tooth, i) => {
        pt(0.25 + i * 0.17, tooth.position);
        tooth.position.y -= 0.025;   // 内側(holder の -y = 曲がりの内)へ
        tooth.rotation.x = Math.PI;  // 内向き
      });
      pt(1, fg.tipCap.position);
    };
    aim(fixed, s);
    aim(moving, -s);
    const fingerTip = anchor(hand, 0, 0, fz + HAND.finger * 0.8);
    return { s, femur, patella, hip, hand, hinge, fingerTip };
  }

  center(out) {
    return this.group.localToWorld(out.copy(this.pos));
  }

  // s: 台本の状態、d: 表示の切り替え(labels / uv / turntable、spin)、draw: false のときは何もしない(助走)
  update(s, d, { draw = true } = {}) {
    if (!draw) return;
    const t = s.t;
    this.group.rotation.y = d.spin;
    // 体
    bodyPoseAt(t, this.pos, this.quat);
    this.body.position.copy(this.pos);
    this.body.quaternion.copy(this.quat);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    // 尾
    tailAt(t, this.tail);
    this.swivel.rotation.y = this.tail.yaw;
    this.joints.forEach((j, k) => (j.rotation.x = this.tail.a[k]));
    // 鋏角: 威嚇と箱のときに動かす
    for (const c of this.chelicerae) c.rotation.y = c.userData.side * (0.05 + 0.22 * s.chew * (0.5 + 0.5 * Math.sin(t * 11 + c.userData.side)));
    this.body.updateMatrixWorld(true);

    // 脚: 足の位置(path.js)→ 3 節の関節を解く
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      leg.hip.fromArray(leg.L.hip).applyQuaternion(this.quat).add(this.pos);
      footAt('floor', i, t, leg.foot);
      poseLeg(leg, this.up, this.quat, 0.6);
    }
    // はさみ: つかむ点と手の向き(claws.js)→ 腿・膝の節を置き、手を回す
    const N = this.tmpN, A = this.tmpA, B = this.tmpB;
    for (const c of this.claws) {
      const f = clawFrameAt(c.s, t, this.pos, this.quat, this.frame);
      A.subVectors(f.wrist, f.hip);
      B.subVectors(f.elbow, f.hip);
      N.crossVectors(A, B).normalize();
      if (N.lengthSq() < 1e-6) N.set(1, 0, 0);
      place(c.femur, f.hip, f.elbow, N);
      place(c.patella, f.elbow, f.wrist, N);
      c.hip.position.copy(f.hip);
      c.hand.position.copy(f.wrist);
      c.hand.quaternion.copy(f.quat);
      c.hinge.rotation.y = c.s * f.open * 0.85;
    }
    // 箱
    boxPoseAt(t, this.box.position, this.box.quaternion);

    // 光: 紫外線(前から後ろへ流れる帯)・針の先・目
    const uv = Math.max(s.uv, d.uv ? 0.55 : 0);
    const sweep = s.uvSweep;   // 0〜1(前 → 後ろ)
    this.uv.forEach((mat, k) => {
      const x = k / (UV_ZONES - 1);
      const band = Math.exp(-(((x - sweep) / 0.12) ** 2));
      mat.emissiveIntensity = uv * (0.9 + 2.2 * band * s.uv);
    });
    this.materials.lamp.emissiveIntensity = 3.2 * uv;
    const glow = stingGlowAt(t);
    this.materials.venom.emissiveIntensity = 0.15 + 0.5 * s.venom + 3.5 * glow;
    this.materials.eyeRim.emissiveIntensity = 0.9 * s.alert * (0.7 + 0.3 * Math.sin(t * 7));

    this.group.updateMatrixWorld(true);
    this.focus.copy(this.pos).applyMatrix4(this.group.matrixWorld);
  }
}
