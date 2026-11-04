import * as THREE from 'three';

// サソリの形の部品(曲がった角・楕円体の帯)

// 曲がりながら細くなる角(針・はさみの指)。+y へ長さ len、太さ r0 → r1、曲がり bend(+z の側へ。ラジアン)
export function horn(len, r0, r1, bend, radial = 12, rows = 12) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, radial, rows, false);
  const pos = geo.attributes.position;
  const R = Math.abs(bend) > 1e-4 ? len / bend : Infinity;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const u = v.y + 0.5;
    const r = r0 + (r1 - r0) * u ** 0.9;
    const phi = bend * u;
    // 中心の線(y-z の面の弧)と、その法線
    const cy = R === Infinity ? len * u : R * Math.sin(phi);
    const cz = R === Infinity ? 0 : R * (1 - Math.cos(phi));
    const ny = -Math.sin(phi), nz = Math.cos(phi);
    pos.setXYZ(i, v.x * r, cy + v.z * r * ny, cz + v.z * r * nz);
  }
  geo.computeVertexNormals();
  return geo;
}

// 楕円体 e({ c, r })の帯(前後の軸 = z)。θ は前の極からの角度、φ は π(左 +x)→ 1.5π(上)→ 2π(右 -x)。scale で少し大きく
export function band(e, th0, th1, ph0, ph1, mat, scale = 1, wseg = 28, hseg = 6) {
  const geo = new THREE.SphereGeometry(1, wseg, hseg, ph0, ph1 - ph0, th0, th1 - th0);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(e.r[0] * scale, e.r[1] * scale, e.r[2] * scale);
  mesh.position.fromArray(e.c);
  return mesh;
}

// 背板のふくらみ(u: 板の前の縁 0 → 後ろの縁 1)。後ろへ増え、縁の手前で丸く戻る(縁が次の板に重なり、中が見えない)
export function tergiteBump(u) {
  u = Math.min(1, Math.max(0, u));
  return u < 0.78 ? (u / 0.78) ** 1.5 : 0.1 + 0.9 * Math.cos(((u - 0.78) / 0.22) * (Math.PI / 2)) ** 0.7;
}

// 背板: 楕円体の帯で、後ろへ向かって少しずつふくらみ、縁で丸く戻る(板の継ぎ目が溝になる)
// b0〜b1: ふくらみを測る範囲(既定は帯と同じ。背骨の線などを板の面に沿わせるときに板の範囲を渡す)
export function tergite(e, th0, th1, ph0, ph1, mat, scale = 1, flare = 0.06, wseg = 28, hseg = 8, b0 = th0, b1 = th1) {
  const geo = new THREE.SphereGeometry(1, wseg, hseg, ph0, ph1 - ph0, th0, th1 - th0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const th = Math.acos(Math.max(-1, Math.min(1, pos.getY(i))));
    const k = 1 + flare * tergiteBump((th - b0) / (b1 - b0));
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(e.r[0] * scale, e.r[1] * scale, e.r[2] * scale);
  mesh.position.fromArray(e.c);
  return mesh;
}

// 楕円体の帯の上の点(band と同じ θ・φ)
export function bandPoint(e, th, ph, out, scale = 1) {
  return out.set(-Math.cos(ph) * Math.sin(th) * e.r[0] * scale + e.c[0], -Math.sin(ph) * Math.sin(th) * e.r[1] * scale + e.c[1], Math.cos(th) * e.r[2] * scale + e.c[2]);
}

// 楕円体(全体)
export function ellipsoid(e, mat, w = 32, h = 16) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, w, h), mat);
  mesh.scale.fromArray(e.r);
  mesh.position.fromArray(e.c);
  return mesh;
}
