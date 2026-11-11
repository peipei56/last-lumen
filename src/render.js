// Canvas renderer. Reads the game state, never changes it.
import { WEAPONS, wstat } from './data.js';
import { TAU, clamp, hash2 } from './util.js';

const PICK_COLOR = { xp: '#6ff2ff', heart: '#ff6b8f', magnet: '#8cb4ff', bomb: '#ffb14a', chest: '#ffe27a', dust: '#fff3c4' };

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.parts = [];
    this.texts = [];
    this.effs = [];
    this.sprites = new Map();
    this.shake = 0;
    this.flash = 0;
    this.hurtT = 0;
    this.camX = 0;
    this.camY = 0;
    this.time = 0;
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.cv.clientWidth || 800, h = this.cv.clientHeight || 600;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    // Keep the visible world area roughly constant on every screen shape.
    this.zoom = clamp(Math.sqrt((w * h) / (1280 * 720)), 0.5, 1.5);
  }

  /** Soft radial sprite, cached per colour. Much cheaper than canvas shadows. */
  glow(color) {
    let s = this.sprites.get(color);
    if (!s) {
      s = document.createElement('canvas');
      s.width = s.height = 64;
      const c = s.getContext('2d');
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, color);
      g.addColorStop(0.25, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = 0.9;
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
      this.sprites.set(color, s);
    }
    return s;
  }

  spr(color, x, y, size, alpha = 1) {
    const c = this.ctx;
    c.globalAlpha = alpha;
    c.drawImage(this.glow(color), x - size, y - size, size * 2, size * 2);
  }

  burst(x, y, color, n, speed = 160, life = 0.5, size = 3) {
    if (this.parts.length > 1100) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.7);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + Math.random() * 0.5), max: life, size: size * (0.6 + Math.random() * 0.8), color });
    }
  }

  text(x, y, str, color, size) {
    if (this.texts.length > 70) this.texts.shift();
    this.texts.push({ x: x + (Math.random() - 0.5) * 14, y, life: 0.7, str, color, size });
  }

  /** Turn simulation events into particles and transient effects. */
  consume(fx) {
    for (const e of fx) {
      switch (e.t) {
        case 'dmg':
          this.text(e.x, e.y, String(e.v), e.crit ? '#ffe27a' : '#ffffff', e.crit ? 19 : 13);
          break;
        case 'kill':
          this.burst(e.x, e.y, e.color, e.big ? 40 : 7, e.big ? 320 : 150, e.big ? 0.9 : 0.45, e.big ? 5 : 3);
          if (e.big) this.addShake(8);
          break;
        case 'boom':
          this.effs.push({ k: 'boom', x: e.x, y: e.y, r: e.r, color: e.color, life: 0.32, max: 0.32 });
          this.burst(e.x, e.y, e.color, 8, 220, 0.4);
          break;
        case 'ring':
          this.effs.push({ k: 'ring', x: e.x, y: e.y, r: e.r, color: e.color, life: 0.4, max: 0.4 });
          break;
        case 'arc':
          this.effs.push({ k: 'arc', pts: e.pts, life: 0.16, max: 0.16, seed: Math.random() * 100 });
          break;
        case 'beam':
          this.effs.push({ k: 'beam', x: e.x, y: e.y, a: e.a, len: e.len, w: e.w, life: 0.26, max: 0.26 });
          break;
        case 'hurt':
          this.addShake(9);
          this.hurtT = 0.35;
          break;
        case 'dash':
          this.burst(e.x, e.y, '#ffffff', 10, 120, 0.35);
          break;
        case 'bomb':
        case 'revive':
          this.flash = 0.5;
          this.addShake(14);
          this.effs.push({ k: 'ring', x: e.x, y: e.y, r: 700, color: '#ffffff', life: 0.6, max: 0.6 });
          break;
        case 'bossdie':
          this.flash = 0.6;
          this.addShake(20);
          this.burst(e.x, e.y, '#ffffff', 60, 420, 1.2, 5);
          this.effs.push({ k: 'ring', x: e.x, y: e.y, r: 520, color: '#ff3d6e', life: 0.8, max: 0.8 });
          break;
        case 'death':
          this.burst(e.x, e.y, '#ffffff', 70, 300, 1.4, 4);
          this.addShake(16);
          break;
        case 'levelup':
          this.effs.push({ k: 'ring', x: this.camX, y: this.camY, r: 160, color: '#ffe27a', life: 0.5, max: 0.5 });
          break;
      }
    }
  }

  addShake(v) {
    if (!this.reduced) this.shake = Math.max(this.shake, v);
  }

  step(dt) {
    this.time += dt;
    this.shake *= Math.exp(-9 * dt);
    if (this.flash > 0) this.flash -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    const ps = this.parts;
    let n = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      ps[n++] = p;
    }
    ps.length = n;
    n = 0;
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= 38 * dt;
      if (t.life > 0) this.texts[n++] = t;
    }
    this.texts.length = n;
    n = 0;
    for (let i = 0; i < this.effs.length; i++) {
      const e = this.effs[i];
      e.life -= dt;
      if (e.life > 0) this.effs[n++] = e;
    }
    this.effs.length = n;
  }

  poly(x, y, r, sides, rot) {
    const c = this.ctx;
    c.beginPath();
    if (!sides) c.arc(x, y, r, 0, TAU);
    else {
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * TAU;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (i) c.lineTo(px, py);
        else c.moveTo(px, py);
      }
      c.closePath();
    }
  }

  background(vw, vh) {
    const c = this.ctx, z = this.zoom;
    c.fillStyle = '#04050c';
    c.fillRect(0, 0, this.w, this.h);
    // Nebula clouds and three star layers, placed by hashing tile coordinates so the world is endless.
    c.globalCompositeOperation = 'lighter';
    const neb = ['#1b2a6b', '#4a1a5e', '#0f4a5a'];
    {
      const f = 0.35, T = 900;
      const ox = this.camX * f, oy = this.camY * f;
      for (let tx = Math.floor((ox - vw) / T); tx <= Math.floor((ox + vw) / T); tx++) {
        for (let ty = Math.floor((oy - vh) / T); ty <= Math.floor((oy + vh) / T); ty++) {
          const hx = hash2(tx, ty, 1), hy = hash2(tx, ty, 2), hs = hash2(tx, ty, 3);
          const sx = ((tx + hx) * T - ox) * z + this.w / 2, sy = ((ty + hy) * T - oy) * z + this.h / 2;
          this.spr(neb[Math.floor(hs * 3)], sx, sy, (380 + hs * 260) * z, 0.55);
        }
      }
    }
    c.fillStyle = '#cfe3ff';
    const layers = [[0.15, 300, 0.35, 1.1], [0.4, 260, 0.55, 1.5], [0.75, 240, 0.8, 2]];
    for (let L = 0; L < 3; L++) {
      const [f, T, al, sz] = layers[L];
      const ox = this.camX * f, oy = this.camY * f;
      c.globalAlpha = al;
      for (let tx = Math.floor((ox - vw / 2) / T); tx <= Math.floor((ox + vw / 2) / T); tx++) {
        for (let ty = Math.floor((oy - vh / 2) / T); ty <= Math.floor((oy + vh / 2) / T); ty++) {
          for (let k = 0; k < 3; k++) {
            const hx = hash2(tx, ty, 10 + L * 7 + k), hy = hash2(tx, ty, 40 + L * 7 + k);
            const tw = 0.6 + 0.4 * Math.sin(this.time * (1 + hx * 2) + hy * 30);
            const s = sz * tw * Math.max(1, z);
            c.fillRect(((tx + hx) * T - ox) * z + this.w / 2, ((ty + hy) * T - oy) * z + this.h / 2, s, s);
          }
        }
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  draw(g) {
    const c = this.ctx, z = this.zoom, p = g.p;
    this.camX = p.x;
    this.camY = p.y;
    const vw = this.w / z, vh = this.h / z;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.background(vw, vh);

    const shx = (Math.random() - 0.5) * this.shake, shy = (Math.random() - 0.5) * this.shake;
    c.save();
    c.translate(this.w / 2 + shx, this.h / 2 + shy);
    c.scale(z, z);
    c.translate(-p.x, -p.y);
    const L = p.x - vw / 2 - 80, R = p.x + vw / 2 + 80, T = p.y - vh / 2 - 80, B = p.y + vh / 2 + 80;
    const vis = (o) => o.x > L && o.x < R && o.y > T && o.y < B;

    // faint floor grid for a sense of speed
    c.strokeStyle = 'rgba(120,150,255,0.055)';
    c.lineWidth = 1;
    c.beginPath();
    const G = 160;
    for (let x = Math.floor(L / G) * G; x < R; x += G) {
      c.moveTo(x, T);
      c.lineTo(x, B);
    }
    for (let y = Math.floor(T / G) * G; y < B; y += G) {
      c.moveTo(L, y);
      c.lineTo(R, y);
    }
    c.stroke();

    // ---- additive layer: glows
    c.globalCompositeOperation = 'lighter';
    for (const z2 of g.zones) {
      if (!vis(z2)) continue;
      if (z2.k === 'mine') {
        const armed = z2.arm <= 0, pulse = 0.5 + 0.5 * Math.sin(this.time * 8);
        this.spr(WEAPONS.mine.color, z2.x, z2.y, armed ? 16 + pulse * 5 : 10, armed ? 0.9 : 0.4);
      }
    }
    for (const k of g.picks) {
      if (!vis(k)) continue;
      const col = PICK_COLOR[k.k];
      const big = k.k !== 'xp' && k.k !== 'dust';
      const s = big ? 16 + Math.sin(this.time * 5 + k.x) * 3 : 6 + Math.min(8, k.v * 0.6);
      this.spr(col, k.x, k.y, s, 1);
    }
    for (const e of g.enemies) {
      if (!vis(e)) continue;
      this.spr(e.color, e.x, e.y, e.r * (e.boss ? 3 : 2.3), e.boss ? 0.6 : 0.42);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';

    // ---- zone outlines
    for (const z2 of g.zones) {
      if (z2.k !== 'meteor' || !vis(z2)) continue;
      const k = 1 - z2.t / z2.max;
      c.strokeStyle = WEAPONS.star.color;
      c.globalAlpha = 0.35 + k * 0.4;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(z2.x, z2.y, z2.r, 0, TAU);
      c.stroke();
      c.globalAlpha = 0.18;
      c.fillStyle = WEAPONS.star.color;
      c.beginPath();
      c.arc(z2.x, z2.y, z2.r * k, 0, TAU);
      c.fill();
      // the falling streak
      c.globalAlpha = 0.9;
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(z2.x + z2.t * 500, z2.y - z2.t * 900);
      c.lineTo(z2.x + z2.t * 380, z2.y - z2.t * 700);
      c.stroke();
    }
    c.globalAlpha = 1;

    // ---- enemies: dark bodies with a lit rim
    for (const e of g.enemies) {
      if (!vis(e)) continue;
      const warn = (e.ai === 'dart' && e.st === 1) || (e.boss && e.ph === 1 && e.sub === 0);
      this.poly(e.x, e.y, e.r, e.shape, e.rot);
      c.fillStyle = e.flash > 0 ? '#ffffff' : warn && Math.sin(this.time * 40) > 0 ? e.color : '#0a0b16';
      c.fill();
      c.lineWidth = e.boss ? 4 : e.elite ? 3.5 : 2.2;
      c.strokeStyle = e.color;
      c.stroke();
      if (e.boss) {
        this.poly(e.x, e.y, e.r * 0.62, e.shape, -e.rot * 1.7);
        c.lineWidth = 2;
        c.stroke();
        c.fillStyle = e.color;
        c.beginPath();
        c.arc(e.x + Math.cos(Math.atan2(p.y - e.y, p.x - e.x)) * 8, e.y + Math.sin(Math.atan2(p.y - e.y, p.x - e.x)) * 8, e.r * 0.2, 0, TAU);
        c.fill();
        if (e.ph === 1 && e.sub === 0) {
          c.globalAlpha = 0.35;
          c.lineWidth = e.r * 1.6;
          c.beginPath();
          c.moveTo(e.x, e.y);
          c.lineTo(e.x + e.cx * 420, e.y + e.cy * 420);
          c.stroke();
          c.globalAlpha = 1;
        }
      } else if (e.elite) {
        c.lineWidth = 1.5;
        c.strokeStyle = '#ffe27a';
        c.beginPath();
        c.arc(e.x, e.y, e.r + 6, 0, TAU);
        c.stroke();
        // elite health arc
        c.strokeStyle = '#ffffff';
        c.beginPath();
        c.arc(e.x, e.y, e.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(e.hp / e.maxHp, 0, 1));
        c.stroke();
      } else {
        c.fillStyle = e.color;
        c.fillRect(e.x - 1.5, e.y - 1.5, 3, 3);
      }
    }

    // ---- additive layer: projectiles, effects, player
    c.globalCompositeOperation = 'lighter';
    for (const b of g.eshots) {
      if (!vis(b)) continue;
      this.spr('#ff3d6e', b.x, b.y, 13, 1);
      this.spr('#ffffff', b.x, b.y, 5, 1);
    }
    for (const s of g.shots) {
      if (!vis(s)) continue;
      const col = WEAPONS[s.src].color;
      this.spr(col, s.x, s.y, 12, 1);
      this.spr(col, s.x - s.vx * 0.018, s.y - s.vy * 0.018, 9, 0.6);
      this.spr('#ffffff', s.x, s.y, 4, 1);
    }
    for (const w of g.weapons) {
      if (w.id !== 'orbit') continue;
      const st = wstat('orbit', w.lv), Rr = st.radius * g.s.area, sz = st.size * g.s.area;
      for (let i = 0; i < st.count; i++) {
        const a = w.ang + (i * TAU) / st.count;
        const x = p.x + Math.cos(a) * Rr, y = p.y + Math.sin(a) * Rr;
        this.spr(WEAPONS.orbit.color, x, y, sz * 1.9, 1);
        this.spr(WEAPONS.orbit.color, p.x + Math.cos(a - 0.18) * Rr, p.y + Math.sin(a - 0.18) * Rr, sz * 1.3, 0.5);
        this.spr('#ffffff', x, y, sz * 0.7, 1);
      }
    }
    for (const e of this.effs) {
      const k = e.life / e.max;
      if (e.k === 'boom') {
        this.spr(e.color, e.x, e.y, e.r * (1.5 - k * 0.5), k * 0.9);
      } else if (e.k === 'ring') {
        c.globalAlpha = k;
        c.strokeStyle = e.color;
        c.lineWidth = 3 + k * 8;
        c.beginPath();
        c.arc(e.x, e.y, e.r * (1 - k * k * 0.85), 0, TAU);
        c.stroke();
      } else if (e.k === 'beam') {
        const ex = e.x + Math.cos(e.a) * e.len, ey = e.y + Math.sin(e.a) * e.len;
        c.globalAlpha = k;
        c.strokeStyle = WEAPONS.lance.color;
        c.lineWidth = e.w * k;
        c.beginPath();
        c.moveTo(e.x, e.y);
        c.lineTo(ex, ey);
        c.stroke();
        c.strokeStyle = '#ffffff';
        c.lineWidth = Math.max(1, e.w * k * 0.3);
        c.stroke();
      } else if (e.k === 'arc') {
        c.globalAlpha = k;
        c.strokeStyle = WEAPONS.arc.color;
        c.lineWidth = 2.5;
        c.beginPath();
        const pts = e.pts;
        c.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) {
          const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1];
          for (let s = 1; s <= 4; s++) {
            const t = s / 4, j = s < 4 ? 14 : 0;
            c.lineTo(ax + (bx - ax) * t + (hash2(i, s, e.seed | 0) - 0.5) * j, ay + (by - ay) * t + (hash2(s, i, e.seed | 0) - 0.5) * j);
          }
        }
        c.stroke();
        c.strokeStyle = '#ffffff';
        c.lineWidth = 1;
        c.stroke();
      }
    }
    for (const q of this.parts) {
      c.globalAlpha = clamp(q.life / q.max, 0, 1);
      c.fillStyle = q.color;
      c.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    // player
    if (!g.over) {
      const blink = p.inv > 0 && Math.sin(this.time * 40) > 0 ? 0.35 : 1;
      const col = g.char.color;
      this.spr(col, p.x, p.y, 46, 0.55 * blink);
      this.spr('#ffffff', p.x, p.y, 17, blink);
      c.globalAlpha = blink;
      c.strokeStyle = col;
      c.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const a = this.time * 2.2 + (i * TAU) / 3;
        c.beginPath();
        c.arc(p.x, p.y, 17, a, a + 1.2);
        c.stroke();
      }
      // dash readiness: a small arc under the core
      const ready = clamp(1 - p.dashCd / 1.8, 0, 1);
      c.globalAlpha = ready >= 1 ? 0.9 : 0.35;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(p.x, p.y, 24, Math.PI / 2 - ready * 0.9, Math.PI / 2 + ready * 0.9);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.restore();

    // ---- darkness: only the player's light keeps the void back
    const cx = this.w / 2 + shx, cy = this.h / 2 + shy;
    const lr = g.s.light * z * (1 + 0.02 * Math.sin(this.time * 3));
    const grad = c.createRadialGradient(cx, cy, lr * 0.45, cx, cy, lr * 1.45);
    grad.addColorStop(0, 'rgba(2,3,9,0)');
    grad.addColorStop(1, 'rgba(2,3,9,0.8)');
    c.fillStyle = grad;
    c.fillRect(0, 0, this.w, this.h);

    // ---- damage numbers above the darkness so they stay readable
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const t of this.texts) {
      c.globalAlpha = clamp(t.life * 2.5, 0, 1);
      c.font = `700 ${Math.round(t.size * Math.max(0.85, z))}px "Chakra Petch", system-ui, sans-serif`;
      c.fillStyle = t.color;
      c.fillText(t.str, (t.x - p.x) * z + cx, (t.y - p.y) * z + cy);
    }
    c.globalAlpha = 1;

    // ---- boss: off-screen pointer
    if (g.boss) {
      const dx = (g.boss.x - p.x) * z, dy = (g.boss.y - p.y) * z;
      if (Math.abs(dx) > this.w / 2 - 20 || Math.abs(dy) > this.h / 2 - 20) {
        const a = Math.atan2(dy, dx), rx = this.w / 2 - 36, ry = this.h / 2 - 36;
        const k = Math.min(rx / Math.abs(Math.cos(a) || 1e-6), ry / Math.abs(Math.sin(a) || 1e-6));
        const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k;
        c.fillStyle = '#ff3d6e';
        c.beginPath();
        c.moveTo(ax + Math.cos(a) * 14, ay + Math.sin(a) * 14);
        c.lineTo(ax + Math.cos(a + 2.5) * 12, ay + Math.sin(a + 2.5) * 12);
        c.lineTo(ax + Math.cos(a - 2.5) * 12, ay + Math.sin(a - 2.5) * 12);
        c.fill();
      }
    }
    if (this.hurtT > 0) {
      const v = c.createRadialGradient(cx, cy, Math.min(this.w, this.h) * 0.3, cx, cy, Math.max(this.w, this.h) * 0.7);
      v.addColorStop(0, 'rgba(255,40,80,0)');
      v.addColorStop(1, `rgba(255,40,80,${this.hurtT * 1.3})`);
      c.fillStyle = v;
      c.fillRect(0, 0, this.w, this.h);
    }
    if (this.flash > 0 && !this.reduced) {
      c.fillStyle = `rgba(255,255,255,${this.flash * 0.7})`;
      c.fillRect(0, 0, this.w, this.h);
    }
  }
}
