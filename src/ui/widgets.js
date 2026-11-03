// 計器の差し替えられる部品(左の上・左の下・右の上の 3 つの枠)。生き物ごとに選んで並べる(creatures/*/hud.js)。
// 部品の形: { title, cls, html, mount(el), update(set, s, tm, compact) }
//   set(key, el, value, prop) は変わったときだけ書き換える(Hud.set に部品ごとの頭文字を付けたもの)

// 横棒の並び(ARM CURL・LEG LOAD など)。data(s, tm) → { badge: { text, tone }, dark, rows: [{ name, value 0〜1, text, hot }] }
export function barsWidget({ title, caption, count, data }) {
  return {
    title,
    cls: 'w-bars',
    html: `<div class="row cap"><span>${caption}</span><i class="badge" data-w="badge"></i></div>
      <div class="curls" data-w="list">${'<div class="c"><span></span><div class="bar"><i></i></div><span class="v"></span></div>'.repeat(count)}</div>`,
    mount(el) {
      this.badge = el.querySelector('[data-w="badge"]');
      this.list = el.querySelector('[data-w="list"]');
      this.rows = [...this.list.children].map((c) => ({ name: c.children[0], fill: c.children[1].firstChild, v: c.children[2] }));
    },
    update(set, s, tm) {
      const d = data(s, tm);
      set('badge', this.badge, d.badge.text);
      set('badgeC', this.badge, `badge ${d.badge.tone ?? ''}`, 'className');
      set('listC', this.list, d.dark ? 'curls trailing' : 'curls', 'className');
      d.rows.forEach((row, i) => {
        const r = this.rows[i];
        set(`n${i}`, r.name, row.name);
        set(`w${i}`, r.fill.style, `${Math.round(Math.min(1, Math.max(0, row.value)) * 100)}%`, 'width');
        set(`v${i}`, r.v, row.text);
        set(`c${i}`, r.v, row.hot ? 'v det' : 'v', 'className');
      });
    },
  };
}

// 姿勢計と 4 行の数字(DEPTH・STANCE など)。data(s, tm) → { rows: [[名前, 値] × 4], pitch, roll, foot: [[名前, 値], [名前, 値]] }
export function attitudeWidget({ title, data }) {
  return {
    title,
    cls: 'w-att',
    html: `<div class="row">
        <svg class="attitude" viewBox="-50 -50 100 100">
          <circle r="45" fill="#fff" stroke="#d9d4cc"/>
          <g stroke="#cfc9c0" stroke-width="1"><path d="M-12 -22h24M-12 22h24M-7 -11h14M-7 11h14"/></g>
          <g data-w="horizon"><path d="M-44 0H-12l6 4 6-8 6 4h38" stroke="var(--orange)" stroke-width="1.6" fill="none"/></g>
        </svg>
        <dl data-w="dl">${'<dt></dt><dd></dd>'.repeat(4)}</dl>
      </div>
      <div class="row foot"><span><span data-w="f0"></span> <b data-w="f0v"></b></span><span><span data-w="f1"></span> <b data-w="f1v"></b></span></div>`,
    mount(el) {
      this.horizon = el.querySelector('[data-w="horizon"]');
      this.cells = [...el.querySelector('[data-w="dl"]').children];
      this.foot = ['f0', 'f0v', 'f1', 'f1v'].map((k) => el.querySelector(`[data-w="${k}"]`));
    },
    update(set, s, tm) {
      const d = data(s, tm);
      d.rows.forEach(([name, value], i) => {
        set(`dt${i}`, this.cells[i * 2], name);
        set(`dd${i}`, this.cells[i * 2 + 1], value);
      });
      d.foot.forEach(([name, value], i) => {
        set(`fn${i}`, this.foot[i * 2], name);
        set(`fv${i}`, this.foot[i * 2 + 1], value);
      });
      const py = Math.max(-30, Math.min(30, d.pitch * 0.35));
      set('horizon', this.horizon, `rotate(${(-d.roll).toFixed(1)}) translate(0 ${py.toFixed(1)})`, 'attr:transform');
    },
  };
}

// 大きな数字 2 つと、canvas の図と、下の行(JET・GAIT など)。
// data(s, tm) → { left: [数, 単位, 説明], right: [数, 単位, 説明], foot: [左の HTML, 右の文字] }、draw(ctx, W, H, s, tm) で図を描く
export function chartWidget({ title, data, draw }) {
  return {
    title,
    cls: 'w-chart',
    html: `<div class="row"><div class="big"><b data-w="l"></b><small data-w="lu"></small></div><div class="big right"><b data-w="r"></b><small class="unit" data-w="ru"></small></div></div>
      <div class="row cap"><span data-w="lc"></span><span data-w="rc"></span></div>
      <canvas data-w="chart" width="516" height="184"></canvas>
      <div class="row foot"><span data-w="f0"></span><span data-w="f1"></span></div>`,
    mount(el) {
      this.el = Object.fromEntries(['l', 'lu', 'lc', 'r', 'ru', 'rc', 'f0', 'f1'].map((k) => [k, el.querySelector(`[data-w="${k}"]`)]));
      this.ctx = el.querySelector('canvas').getContext('2d');
    },
    update(set, s, tm, compact) {
      const d = data(s, tm);
      const e = this.el;
      [['l', 'lu', 'lc', d.left], ['r', 'ru', 'rc', d.right]].forEach(([a, b, c, v]) => {
        set(a, e[a], v[0]);
        set(b, e[b], v[1]);
        set(c, e[c], v[2]);
      });
      set('f0', e.f0, d.foot[0], 'innerHTML');
      set('f1', e.f1, d.foot[1]);
      if (!compact) draw(this.ctx, this.ctx.canvas.width, this.ctx.canvas.height, s, tm);
    },
  };
}

// canvas の図の下地(点線の目盛りと、左右の下の文字)。値 v(0〜100)→ y を返す
export function chartFrame(c, W, H, { grid = [[100, '100'], [50, '50']], leftLabel = '-1.2 S', rightLabel = 'NOW', nowLine = true } = {}) {
  const top = 16, bottom = H - 26, left = 4, right = W - 4;
  c.clearRect(0, 0, W, H);
  c.font = '15px ui-monospace, Menlo, monospace';
  c.fillStyle = '#a7a29a';
  c.strokeStyle = '#e1ddd6';
  c.lineWidth = 1.5;
  c.setLineDash([3, 5]);
  for (const [v, label] of grid) {
    const y = bottom - (v / 100) * (bottom - top);
    c.beginPath();
    c.moveTo(left, y);
    c.lineTo(right, y);
    c.stroke();
    c.fillText(label, right - 70, y - 5);
  }
  if (nowLine) {
    c.beginPath();
    c.moveTo(right - 18, top - 6);
    c.lineTo(right - 18, bottom);
    c.stroke();
  }
  c.setLineDash([]);
  c.fillText(leftLabel, left, H - 4);
  c.fillText(rightLabel, right - 40, H - 4);
  return { top, bottom, left, right, y: (v) => bottom - (Math.min(105, v) / 100) * (bottom - top) };
}
