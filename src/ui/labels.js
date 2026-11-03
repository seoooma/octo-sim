import * as THREE from 'three';

// 引き出し線: 3D の部品(付け根)から、画面の外側へ線を引いて名前を書く。
// 付け根は Object3D(部品の子)。毎コマ画面の座標へ写す。
const OUT = 70;     // 付け根から曲がり角まで(px)
const TAIL = 46;    // 曲がり角から文字まで(px)
const GAP = 34;     // 同じ側の文字どうしの最小の間隔(px)

const v = new THREE.Vector3();

export class Labels {
  constructor(root) {
    this.root = root;
    root.innerHTML = '<svg></svg>';
    this.svg = root.firstChild;
    this.items = [];
    this.key = null;
  }

  // set: 名前と付け根の組、fade: 濃さ(0 で消す)、center: ロボットの中心(世界の座標)
  update(camera, set, setKey, fade, center) {
    if (!set || fade <= 0.001) {
      this.root.style.opacity = 0;
      return;
    }
    if (this.key !== setKey) this.build(set, setKey);
    this.root.style.opacity = fade.toFixed(3);
    const W = window.innerWidth, H = window.innerHeight;
    const toScreen = (p) => {
      v.copy(p).project(camera);
      return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, behind: v.z > 1 };
    };
    const c = toScreen(center);
    const placed = set.map((item, i) => {
      item.anchor.getWorldPosition(v);
      const a = toScreen(v);
      let dx = a.x - c.x, dy = a.y - c.y;
      const len = Math.hypot(dx, dy) || 1;
      if (len < 20) { dx = 1; dy = -0.4; } else { dx /= len; dy /= len; }
      const side = dx >= 0 ? 1 : -1;
      return { i, a, side, ex: a.x + dx * OUT, ey: a.y + dy * OUT };
    });
    // 同じ側で文字が重ならないよう、上から順に間隔をあける
    for (const side of [-1, 1]) {
      const list = placed.filter((p) => p.side === side).sort((p, q) => p.ey - q.ey);
      for (let k = 1; k < list.length; k++) list[k].ey = Math.max(list[k].ey, list[k - 1].ey + GAP);
    }
    for (const p of placed) {
      const el = this.items[p.i];
      // 文字が画面の外へはみ出さないよう、幅の分だけ内側に寄せる
      const w = el.width || (el.width = el.div.offsetWidth);
      const lx = p.side > 0 ? Math.min(W - w - 6, p.ex + TAIL) : Math.max(w + 6, p.ex - TAIL);
      const ly = Math.min(H - 20, Math.max(20, p.ey));
      el.dot.setAttribute('cx', p.a.x.toFixed(1));
      el.dot.setAttribute('cy', p.a.y.toFixed(1));
      el.line.setAttribute('points', `${p.a.x.toFixed(1)},${p.a.y.toFixed(1)} ${p.ex.toFixed(1)},${ly.toFixed(1)} ${(lx - p.side * 6).toFixed(1)},${ly.toFixed(1)}`);
      el.div.style.left = `${lx.toFixed(1)}px`;
      el.div.style.top = `${ly.toFixed(1)}px`;
      el.div.className = p.side < 0 ? 'lb left' : 'lb';
      const hide = p.a.behind;
      el.div.style.visibility = el.dot.style.visibility = el.line.style.visibility = hide ? 'hidden' : 'visible';
    }
  }

  build(set, key) {
    this.key = key;
    this.svg.innerHTML = '';
    for (const it of this.items) it.div.remove();
    const ns = 'http://www.w3.org/2000/svg';
    this.items = set.map((item) => {
      const line = document.createElementNS(ns, 'polyline');
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', '#9d988f');
      line.setAttribute('stroke-width', '1');
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('r', '3.2');
      dot.setAttribute('fill', '#ef5b2b');
      dot.setAttribute('stroke', '#fff');
      dot.setAttribute('stroke-width', '1.2');
      this.svg.append(line, dot);
      const div = document.createElement('div');
      div.className = 'lb';
      div.innerHTML = `${item.title}<small>${item.sub}</small>`;
      this.root.append(div);
      return { line, dot, div };
    });
  }
}
