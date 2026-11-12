// Small math helpers shared by the simulation and the renderer.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Deterministic PRNG so a run can be replayed from its seed (used by the tests). */
export function mulberry32(seed) {
  // The state lives on the function (`rng.s`) so a suspended run can save and restore it.
  const f = function () {
    const a = (f.s = (f.s + 0x6d2b79f5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.s = seed >>> 0;
  return f;
}

/** Integer hash for procedural background placement. */
export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** Uniform grid for broad-phase collision. Cells are reused between frames to avoid garbage. */
export class SpatialHash {
  constructor(cell) {
    this.c = cell;
    this.m = new Map();
    this.used = [];
  }
  clear() {
    for (const a of this.used) a.length = 0;
    this.used.length = 0;
  }
  insert(o) {
    const k = ((Math.floor(o.x / this.c) & 0xffff) << 16) | (Math.floor(o.y / this.c) & 0xffff);
    let a = this.m.get(k);
    if (!a) {
      a = [];
      this.m.set(k, a);
    }
    if (a.length === 0) this.used.push(a);
    a.push(o);
  }
  /** Fills `out` with every object whose cell overlaps the circle's bounding box. */
  query(x, y, r, out) {
    out.length = 0;
    const c = this.c;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const a = this.m.get(((cx & 0xffff) << 16) | (cy & 0xffff));
        if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
      }
    }
    return out;
  }
}
