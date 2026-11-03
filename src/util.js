// 小物(数のなめらかなつなぎ・決まった乱数)
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, u) => a + (b - a) * u;
export const fract = (x) => x - Math.floor(x);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// 整数 i から 0〜1 の決まった値(毎回同じ)
export const hash = (i) => fract(Math.sin(i * 127.1 + 311.7) * 43758.5453);

// 種から決まった乱数の列(形を毎回同じにするため)
export function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const deg = (r) => (r * 180) / Math.PI;
export const pad2 = (n) => String(Math.floor(n)).padStart(2, '0');
