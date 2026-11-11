// The simulation. No DOM or canvas in here, so it runs unchanged in the browser and in Node tests.
// Everything visual or audible is reported through `game.fx`, a queue the front end drains each frame.
import {
  WEAPONS, PASSIVES, ENEMIES, CHARS, wstat, spawnTable, xpFor,
  MAX_WEAPONS, MAX_PASSIVES, WEAPON_MAX_LV, PASSIVE_MAX_LV, BOSS_INTERVAL, BOSSES_TO_WIN,
} from './data.js';
import { TAU, mulberry32, SpatialHash } from './util.js';

const PAD = 50; // largest enemy radius, added to broad-phase queries

export class Game {
  constructor({ charId = 'lumi', meta = {}, seed = (Date.now() & 0x7fffffff) } = {}) {
    this.rng = mulberry32(seed);
    this.meta = meta;
    this.charId = charId;
    this.char = CHARS[charId];
    this.t = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNext = xpFor(1);
    this.pending = 0; // upgrade choices waiting for the player
    this.pendingChest = 0;
    this.over = false;
    this.won = false;
    this.endless = false;
    this.enemies = [];
    this.shots = [];
    this.eshots = [];
    this.picks = [];
    this.zones = [];
    this.fx = [];
    this.weapons = [];
    this.passives = {};
    this.dmgBy = {};
    this.dust = 0;
    this.hash = new SpatialHash(80);
    this.q1 = [];
    this.q2 = [];
    this.spawnAcc = 0;
    this.bossIdx = 0;
    this.boss = null;
    this.bossWarned = false;
    this.nextSwarm = 45;
    this.nextElite = 60;
    this.rerolls = meta.rer || 0;
    this.revives = meta.rev || 0;
    this.s = {};
    this.p = { x: 0, y: 0, fx: 1, fy: 0, r: 12, hp: 100, inv: 0, dashCd: 0, dashT: 0, dx: 1, dy: 0, moving: false };
    this.weapons.push({ id: this.char.weapon, lv: 1, cd: 0.4, ang: 0 });
    this.recalc();
    this.p.hp = this.s.maxHp;
    // An opening handful so the first seconds are not empty.
    for (let i = 0; i < 6; i++) {
      const [x, y] = this.ringPos(400, 560);
      this.spawn('wisp', x, y);
    }
  }

  emit(e) {
    if (this.fx.length < 500) this.fx.push(e);
  }

  recalc() {
    const P = this.passives, m = this.meta, c = this.char.mods || {}, s = this.s;
    const oldMax = s.maxHp || 0;
    s.dmg = 1 + 0.12 * (P.might || 0) + 0.05 * (m.pow || 0);
    s.cd = Math.max(0.4, 1 - 0.07 * (P.haste || 0)) * (c.cd || 1);
    s.speed = 215 * (1 + 0.08 * (P.swift || 0) + 0.03 * (m.spd || 0)) * (c.speed || 1);
    s.maxHp = 100 + 20 * (P.vital || 0) + 10 * (m.vit || 0) + (c.hp || 0);
    s.regen = 0.3 * (P.vital || 0);
    s.magnet = 95 * (1 + 0.3 * (P.magnet || 0) + 0.1 * (m.mag || 0));
    s.area = 1 + 0.1 * (P.amp || 0);
    s.crit = 0.05 + 0.07 * (P.fortune || 0) + (c.crit || 0);
    s.armor = 1.5 * (P.aegis || 0);
    s.xp = 1 + 0.08 * (P.lumen || 0) + 0.05 * (m.xp || 0);
    s.light = 340 + 45 * (P.lumen || 0);
    if (oldMax && s.maxHp > oldMax) this.p.hp += s.maxHp - oldMax;
  }

  // ---------------------------------------------------------------- upgrades

  /** Returns up to `n` upgrade options for the level-up screen. */
  choices(n = 3) {
    const pool = [];
    const owned = new Map(this.weapons.map((w) => [w.id, w]));
    for (const id in WEAPONS) {
      const w = owned.get(id);
      if (w) {
        if (w.lv < WEAPON_MAX_LV) pool.push({ type: 'weapon', id, lv: w.lv + 1, w: 1.7 });
      } else if (this.weapons.length < MAX_WEAPONS) pool.push({ type: 'weapon', id, lv: 1, w: 1 });
    }
    const pcount = Object.keys(this.passives).length;
    for (const id in PASSIVES) {
      const lv = this.passives[id] || 0;
      if (lv > 0) {
        if (lv < PASSIVE_MAX_LV) pool.push({ type: 'passive', id, lv: lv + 1, w: 1.5 });
      } else if (pcount < MAX_PASSIVES) pool.push({ type: 'passive', id, lv: 1, w: 1 });
    }
    if (!pool.length) return [{ type: 'heal' }, { type: 'dust' }];
    const out = [];
    while (out.length < n && pool.length) {
      let total = 0;
      for (const c of pool) total += c.w;
      let r = this.rng() * total, i = 0;
      for (; i < pool.length - 1; i++) {
        r -= pool[i].w;
        if (r <= 0) break;
      }
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  }

  apply(c) {
    if (c.type === 'weapon') {
      const w = this.weapons.find((x) => x.id === c.id);
      if (w) w.lv = Math.min(WEAPON_MAX_LV, w.lv + 1);
      else this.weapons.push({ id: c.id, lv: 1, cd: 0.3, ang: 0 });
    } else if (c.type === 'passive') {
      this.passives[c.id] = Math.min(PASSIVE_MAX_LV, (this.passives[c.id] || 0) + 1);
      this.recalc();
    } else if (c.type === 'heal') {
      this.p.hp = Math.min(this.s.maxHp, this.p.hp + 50);
    } else if (c.type === 'dust') {
      this.dust += 15;
    }
    if (this.pending > 0) this.pending--;
    if (this.pendingChest > 0) this.pendingChest--;
  }

  gainXp(v) {
    this.xp += v * this.s.xp;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpFor(this.level);
      this.pending++;
      this.emit({ t: 'levelup' });
    }
  }

  // ---------------------------------------------------------------- combat helpers

  hit(e, dmg, src, kx = 0, ky = 0, kb = 0) {
    if (e.dead) return;
    const crit = this.rng() < this.s.crit;
    const d = Math.max(1, Math.round(dmg * this.s.dmg * (crit ? 2 : 1)));
    this.dmgBy[src] = (this.dmgBy[src] || 0) + Math.min(d, Math.max(0, e.hp));
    e.hp -= d;
    e.flash = 0.09;
    if (kb && !e.boss) {
      const k = kb / (e.elite ? 3 : 1);
      e.kvx += kx * k;
      e.kvy += ky * k;
    }
    this.emit({ t: 'dmg', x: e.x, y: e.y - e.r, v: d, crit });
    if (e.hp <= 0) this.kill(e);
  }

  aoe(x, y, r, dmg, src, kb = 0) {
    const list = this.hash.query(x, y, r + PAD, this.q2);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y, rr = r + e.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 1;
        this.hit(e, dmg, src, dx / d, dy / d, kb);
      }
    }
  }

  nearest(x, y, maxD, skip) {
    let best = null, bd = maxD * maxD;
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (e.dead || (skip && skip.includes(e))) continue;
      const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  drop(k, x, y, v = 1) {
    if (k === 'xp' && this.picks.length > 450) {
      // Too many shards on the field: fold the value into an existing one.
      for (let i = this.picks.length - 1; i >= 0; i--) {
        if (this.picks[i].k === 'xp') {
          this.picks[i].v += v;
          return;
        }
      }
    }
    this.picks.push({ k, x, y, v, mag: false, sp: 0 });
  }

  kill(e) {
    e.dead = true;
    this.kills++;
    this.emit({ t: 'kill', x: e.x, y: e.y, r: e.r, color: e.color, big: e.elite || e.boss });
    this.drop('xp', e.x, e.y, e.xp);
    const r = this.rng();
    if (r < 0.007) this.drop('heart', e.x + 8, e.y);
    else if (r < 0.0095) this.drop('magnet', e.x + 8, e.y);
    else if (r < 0.0115) this.drop('bomb', e.x + 8, e.y);
    if (e.type === 'splitter') {
      for (let i = 0; i < 3 && this.enemies.length < 440; i++) {
        const a = this.rng() * TAU;
        this.spawn('mite', e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14);
      }
    }
    if (e.elite) {
      this.drop('chest', e.x, e.y);
      this.drop('dust', e.x - 10, e.y + 6, 5);
    }
    if (e.boss) {
      this.boss = null;
      this.bossIdx++;
      this.bossWarned = false;
      this.drop('chest', e.x, e.y);
      this.drop('heart', e.x + 24, e.y);
      this.drop('magnet', e.x - 24, e.y);
      this.drop('dust', e.x, e.y + 24, 25);
      this.eshots.length = 0;
      this.emit({ t: 'bossdie', x: e.x, y: e.y });
      if (this.bossIdx >= BOSSES_TO_WIN && !this.endless) this.won = true;
    }
  }

  hurt(d) {
    const p = this.p;
    if (p.inv > 0 || p.dashT > 0 || this.over) return;
    d = Math.max(d * 0.25, d - this.s.armor);
    p.hp -= d;
    p.inv = 0.6;
    this.emit({ t: 'hurt', v: d });
    if (p.hp <= 0) {
      if (this.revives > 0) {
        this.revives--;
        p.hp = this.s.maxHp * 0.5;
        p.inv = 2.5;
        this.aoe(p.x, p.y, 420, 150, 'revive', 600);
        this.emit({ t: 'revive', x: p.x, y: p.y });
      } else {
        p.hp = 0;
        this.over = true;
        this.emit({ t: 'death', x: p.x, y: p.y });
      }
    }
  }

  // ---------------------------------------------------------------- spawning

  hpMul() {
    const m = this.t / 60;
    return 1 + m * 0.3 + m * m * 0.04;
  }

  spawn(type, x, y, elite = false) {
    const d = ENEMIES[type];
    const mul = this.hpMul();
    const e = {
      type, x, y, r: d.r, hp: d.hp * mul, spd: d.spd * (0.92 + this.rng() * 0.16), dmg: d.dmg * (1 + this.t / 600),
      xp: d.xp, color: d.color, shape: d.shape, ai: d.ai, kvx: 0, kvy: 0, flash: 0, dead: false,
      rot: this.rng() * TAU, st: 0, tm: this.rng() * 2, cx: 0, cy: 0, orbT: 0, elite: false, boss: false,
    };
    if (elite) {
      e.elite = true;
      e.hp *= 9;
      e.r *= 1.55;
      e.dmg *= 1.5;
      e.xp *= 10;
    }
    e.maxHp = e.hp;
    this.enemies.push(e);
    return e;
  }

  ringPos(min, max) {
    const a = this.rng() * TAU, d = min + this.rng() * (max - min);
    return [this.p.x + Math.cos(a) * d, this.p.y + Math.sin(a) * d];
  }

  pickType() {
    const tbl = spawnTable(this.t / 60);
    let total = 0;
    for (const t of tbl) total += t[1];
    let r = this.rng() * total;
    for (const t of tbl) {
      r -= t[1];
      if (r <= 0) return t[0];
    }
    return 'wisp';
  }

  spawnBoss() {
    const tier = this.bossIdx;
    const [x, y] = this.ringPos(620, 680);
    const e = this.spawn('boss', x, y);
    const d = ENEMIES.boss;
    e.boss = true;
    e.tier = tier;
    e.hp = e.maxHp = d.hp * (1 + tier * 1.25) * (1 + tier * 0.25);
    e.dmg = d.dmg + tier * 5;
    e.r = d.r + tier * 4;
    e.ph = 0;
    e.pt = 5;
    e.at = 1.5;
    e.sub = 0;
    e.spin = 0;
    this.boss = e;
    this.emit({ t: 'boss' });
  }

  director(dt) {
    const m = this.t / 60;
    const rate = (1.1 + m * 0.95 + m * m * 0.05) * (this.boss ? 0.45 : 1);
    const cap = Math.min(380, 50 + m * 42);
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc--;
      if (this.enemies.length >= cap) {
        this.spawnAcc = 0;
        break;
      }
      const [x, y] = this.ringPos(700, 840);
      this.spawn(this.pickType(), x, y);
    }
    if (this.t >= this.nextSwarm) {
      this.nextSwarm += 45;
      const n = Math.max(0, Math.min(60, Math.floor(14 + m * 4), 430 - this.enemies.length));
      const type = m > 5 ? 'mite' : 'wisp';
      const a0 = this.rng() * TAU;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * TAU;
        this.spawn(type, this.p.x + Math.cos(a) * 640, this.p.y + Math.sin(a) * 640);
      }
      this.emit({ t: 'swarm' });
    }
    if (this.t >= this.nextElite) {
      this.nextElite += 60;
      const [x, y] = this.ringPos(700, 760);
      this.spawn(m > 4 ? 'splitter' : m > 2 ? 'brute' : 'darter', x, y, true);
    }
    const bossAt = BOSS_INTERVAL * (this.bossIdx + 1);
    if (!this.boss) {
      if (!this.bossWarned && this.t >= bossAt - 4) {
        this.bossWarned = true;
        this.emit({ t: 'bosswarn' });
      }
      if (this.t >= bossAt) this.spawnBoss();
    }
  }

  // ---------------------------------------------------------------- weapons

  fire(w, st) {
    const p = this.p, A = this.s.area;
    switch (w.id) {
      case 'bolt': {
        const e = this.nearest(p.x, p.y, 620);
        if (!e) return false;
        const base = Math.atan2(e.y - p.y, e.x - p.x);
        for (let i = 0; i < st.count; i++) {
          const a = base + (i - (st.count - 1) / 2) * 0.13;
          this.shots.push({ x: p.x, y: p.y, vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed, r: 5, dmg: st.dmg, pierce: st.pierce, life: 1.1, src: 'bolt', hit: [], home: false, blast: 0 });
        }
        this.emit({ t: 'shoot', k: 'bolt' });
        return true;
      }
      case 'nova': {
        const R = st.radius * A;
        if (!this.nearest(p.x, p.y, R * 1.25)) return false;
        this.aoe(p.x, p.y, R, st.dmg, 'nova', 260);
        this.emit({ t: 'ring', x: p.x, y: p.y, r: R, color: WEAPONS.nova.color });
        return true;
      }
      case 'arc': {
        let cur = this.nearest(p.x, p.y, st.range);
        if (!cur) return false;
        const hitList = [], pts = [p.x, p.y];
        for (let i = 0; i < st.chains && cur; i++) {
          hitList.push(cur);
          pts.push(cur.x, cur.y);
          const cx = cur.x, cy = cur.y;
          this.hit(cur, st.dmg, 'arc');
          cur = this.nearest(cx, cy, st.jump * A, hitList);
        }
        this.emit({ t: 'arc', pts });
        return true;
      }
      case 'lance': {
        const e = this.nearest(p.x, p.y, st.len * 0.8);
        if (!e) return false;
        const base = Math.atan2(e.y - p.y, e.x - p.x), half = (st.width * A) / 2;
        for (let b = 0; b < st.beams; b++) {
          const a = base + (b * TAU) / st.beams, ux = Math.cos(a), uy = Math.sin(a);
          const es = this.enemies;
          for (let i = 0; i < es.length; i++) {
            const t = es[i];
            if (t.dead) continue;
            const dx = t.x - p.x, dy = t.y - p.y, pr = dx * ux + dy * uy;
            if (pr < -t.r || pr > st.len) continue;
            if (Math.abs(dx * uy - dy * ux) < half + t.r) this.hit(t, st.dmg, 'lance', ux, uy, 60);
          }
          this.emit({ t: 'beam', x: p.x, y: p.y, a, len: st.len, w: half * 2 });
        }
        return true;
      }
      case 'star': {
        const near = [];
        const es = this.enemies;
        for (let i = 0; i < es.length; i++) {
          const dx = es[i].x - p.x, dy = es[i].y - p.y;
          if (dx * dx + dy * dy < 520 * 520) near.push(es[i]);
        }
        if (!near.length) return false;
        for (let i = 0; i < st.count; i++) {
          const e = near[Math.floor(this.rng() * near.length)];
          this.zones.push({ k: 'meteor', x: e.x + (this.rng() - 0.5) * 30, y: e.y + (this.rng() - 0.5) * 30, t: 0.55, max: 0.55, r: st.radius * A, dmg: st.dmg });
        }
        return true;
      }
      case 'drone': {
        if (!this.nearest(p.x, p.y, 700)) return false;
        for (let i = 0; i < st.count; i++) {
          const a = this.rng() * TAU;
          this.shots.push({ x: p.x, y: p.y, vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed, r: 6, dmg: st.dmg, pierce: 0, life: 3, src: 'drone', hit: [], home: true, speed: st.speed, tgt: null, blast: st.blast * A });
        }
        this.emit({ t: 'shoot', k: 'drone' });
        return true;
      }
      case 'mine': {
        let n = 0;
        for (const z of this.zones) if (z.k === 'mine') n++;
        if (n >= 28) return false;
        this.zones.push({ k: 'mine', x: p.x, y: p.y, arm: 0.45, life: 14, r: st.radius * A, dmg: st.dmg });
        return true;
      }
    }
    return false;
  }

  updateWeapons(dt) {
    const p = this.p;
    for (const w of this.weapons) {
      const st = wstat(w.id, w.lv);
      if (w.id === 'orbit') {
        w.ang += dt * st.rot;
        const R = st.radius * this.s.area, size = st.size * this.s.area;
        for (let i = 0; i < st.count; i++) {
          const a = w.ang + (i * TAU) / st.count;
          const ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R;
          const list = this.hash.query(ox, oy, size + PAD, this.q1);
          for (let j = 0; j < list.length; j++) {
            const e = list[j];
            if (e.dead || e.orbT > this.t) continue;
            const dx = e.x - ox, dy = e.y - oy, rr = size + e.r;
            if (dx * dx + dy * dy < rr * rr) {
              e.orbT = this.t + 0.3;
              const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
              this.hit(e, st.dmg, 'orbit', (e.x - p.x) / d, (e.y - p.y) / d, 120);
            }
          }
        }
        continue;
      }
      w.cd -= dt;
      if (w.cd > 0) continue;
      w.cd = this.fire(w, st) ? st.cd * this.s.cd : 0.12;
    }
  }

  updateShots(dt) {
    const shots = this.shots;
    let n = 0;
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      s.life -= dt;
      if (s.home) {
        if (!s.tgt || s.tgt.dead) s.tgt = this.nearest(s.x, s.y, 600);
        if (s.tgt) {
          const dx = s.tgt.x - s.x, dy = s.tgt.y - s.y, d = Math.hypot(dx, dy) || 1;
          const k = Math.min(1, 7 * dt);
          s.vx += ((dx / d) * s.speed - s.vx) * k;
          s.vy += ((dy / d) * s.speed - s.vy) * k;
        }
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      let alive = s.life > 0;
      if (alive) {
        const list = this.hash.query(s.x, s.y, s.r + PAD, this.q1);
        for (let j = 0; j < list.length; j++) {
          const e = list[j];
          if (e.dead || s.hit.includes(e)) continue;
          const dx = e.x - s.x, dy = e.y - s.y, rr = s.r + e.r;
          if (dx * dx + dy * dy < rr * rr) {
            if (s.blast) {
              this.aoe(s.x, s.y, s.blast, s.dmg, s.src, 80);
              this.emit({ t: 'boom', x: s.x, y: s.y, r: s.blast, color: WEAPONS[s.src].color });
              alive = false;
            } else {
              const sp = Math.hypot(s.vx, s.vy) || 1;
              this.hit(e, s.dmg, s.src, s.vx / sp, s.vy / sp, 90);
              s.hit.push(e);
              if (--s.pierce < 0) alive = false;
            }
            if (!alive) break;
          }
        }
      }
      if (alive) shots[n++] = s;
    }
    shots.length = n;
  }

  updateZones(dt) {
    const zs = this.zones;
    let n = 0;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      let alive = true;
      if (z.k === 'meteor') {
        z.t -= dt;
        if (z.t <= 0) {
          this.aoe(z.x, z.y, z.r, z.dmg, 'star', 120);
          this.emit({ t: 'boom', x: z.x, y: z.y, r: z.r, color: WEAPONS.star.color });
          alive = false;
        }
      } else {
        z.arm -= dt;
        z.life -= dt;
        if (z.life <= 0) alive = false;
        else if (z.arm <= 0) {
          const list = this.hash.query(z.x, z.y, z.r * 0.45 + PAD, this.q1);
          for (let j = 0; j < list.length; j++) {
            const e = list[j];
            const dx = e.x - z.x, dy = e.y - z.y, rr = z.r * 0.45 + e.r;
            if (!e.dead && dx * dx + dy * dy < rr * rr) {
              this.aoe(z.x, z.y, z.r, z.dmg, 'mine', 200);
              this.emit({ t: 'boom', x: z.x, y: z.y, r: z.r, color: WEAPONS.mine.color });
              alive = false;
              break;
            }
          }
        }
      }
      if (alive) zs[n++] = z;
    }
    zs.length = n;
  }

  // ---------------------------------------------------------------- enemies

  eshoot(x, y, a, speed, dmg) {
    if (this.eshots.length < 420) this.eshots.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 6, dmg, life: 6 });
  }

  bossAI(e, dt, nx, ny) {
    let vx = 0, vy = 0;
    e.pt -= dt;
    if (e.pt <= 0) {
      e.ph = (e.ph + 1) % 3;
      e.pt = e.ph === 1 ? 3.3 : 5;
      e.at = 0.7;
      e.sub = 0;
      if (e.ph === 2) {
        const n = 6 + e.tier * 2;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          this.spawn(e.tier >= 2 ? 'darter' : 'wisp', e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90);
        }
        this.emit({ t: 'ring', x: e.x, y: e.y, r: 110, color: e.color });
      }
    }
    if (e.ph === 0) {
      vx = nx * e.spd;
      vy = ny * e.spd;
      e.at -= dt;
      if (e.at <= 0) {
        e.at = 1.35 - e.tier * 0.1;
        const n = 12 + e.tier * 3;
        e.spin += 0.27;
        for (let i = 0; i < n; i++) this.eshoot(e.x, e.y, e.spin + (i / n) * TAU, 170 + e.tier * 12, e.dmg * 0.5);
        this.emit({ t: 'eshoot' });
      }
    } else if (e.ph === 1) {
      e.at -= dt;
      if (e.sub === 0) {
        e.cx = nx;
        e.cy = ny;
        if (e.at <= 0) {
          e.sub = 1;
          e.at = 0.6;
          this.emit({ t: 'charge' });
        }
      } else {
        vx = e.cx * 540;
        vy = e.cy * 540;
        if (e.at <= 0) {
          e.sub = 0;
          e.at = 0.75;
        }
      }
    } else {
      vx = nx * e.spd * 0.4;
      vy = ny * e.spd * 0.4;
      e.at -= dt;
      if (e.at <= 0) {
        e.at = 0.13;
        e.spin += 0.31;
        const arms = 2 + (e.tier >= 2 ? 1 : 0);
        for (let i = 0; i < arms; i++) this.eshoot(e.x, e.y, e.spin + (i / arms) * TAU, 150 + e.tier * 10, e.dmg * 0.5);
      }
    }
    e.vx = vx;
    e.vy = vy;
  }

  updateEnemies(dt) {
    const p = this.p, es = this.enemies;
    const decay = Math.exp(-7 * dt);
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (e.dead) continue;
      let dx = p.x - e.x, dy = p.y - e.y;
      let d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;
      let vx = 0, vy = 0;
      if (e.flash > 0) e.flash -= dt;
      e.rot += dt * (e.boss ? 0.6 : 1.4);
      if (e.ai === 'chase') {
        vx = nx * e.spd;
        vy = ny * e.spd;
      } else if (e.ai === 'dart') {
        e.tm -= dt;
        if (e.st === 0) {
          vx = nx * e.spd;
          vy = ny * e.spd;
          if (d < 270 && e.tm <= 0) {
            e.st = 1;
            e.tm = 0.5;
          }
        } else if (e.st === 1) {
          e.cx = nx;
          e.cy = ny;
          if (e.tm <= 0) {
            e.st = 2;
            e.tm = 0.42;
          }
        } else if (e.st === 2) {
          vx = e.cx * 430;
          vy = e.cy * 430;
          if (e.tm <= 0) {
            e.st = 0;
            e.tm = 0.9;
          }
        }
      } else if (e.ai === 'spit') {
        const dir = d > 300 ? 1 : d < 210 ? -1 : 0;
        if (dir) {
          vx = nx * e.spd * dir;
          vy = ny * e.spd * dir;
        } else {
          vx = -ny * e.spd * 0.7;
          vy = nx * e.spd * 0.7;
        }
        e.tm -= dt;
        if (e.tm <= 0 && d < 460) {
          e.tm = 2.3;
          this.eshoot(e.x, e.y, Math.atan2(dy, dx), 190, e.dmg);
        }
      } else if (e.ai === 'boss') {
        this.bossAI(e, dt, nx, ny);
        vx = e.vx;
        vy = e.vy;
      }
      // Soft separation so the horde spreads out instead of stacking on one point.
      if (!e.boss) {
        const list = this.hash.query(e.x, e.y, e.r + 22, this.q1);
        let sx = 0, sy = 0;
        for (let j = 0; j < list.length; j++) {
          const o = list[j];
          if (o === e || o.dead) continue;
          const ox = e.x - o.x, oy = e.y - o.y, rr = e.r + o.r;
          const o2 = ox * ox + oy * oy;
          if (o2 < rr * rr && o2 > 0.01) {
            const od = Math.sqrt(o2);
            sx += (ox / od) * (rr - od);
            sy += (oy / od) * (rr - od);
          }
        }
        vx += sx * 9;
        vy += sy * 9;
      }
      e.x += (vx + e.kvx) * dt;
      e.y += (vy + e.kvy) * dt;
      e.kvx *= decay;
      e.kvy *= decay;
      dx = p.x - e.x;
      dy = p.y - e.y;
      d = Math.hypot(dx, dy);
      if (d < e.r + p.r) this.hurt(e.dmg);
      else if (d > 1500 && !e.boss) {
        // Left far behind: bring it back around the player so pressure stays constant.
        const [x, y] = this.ringPos(780, 880);
        e.x = x;
        e.y = y;
      }
    }
    let n = 0;
    for (let i = 0; i < es.length; i++) if (!es[i].dead) es[n++] = es[i];
    es.length = n;
  }

  updateEshots(dt) {
    const p = this.p, bs = this.eshots;
    let n = 0;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const dx = b.x - p.x, dy = b.y - p.y, rr = b.r + p.r - 2;
      if (dx * dx + dy * dy < rr * rr && p.dashT <= 0 && p.inv <= 0) {
        this.hurt(b.dmg);
        continue;
      }
      if (b.life > 0) bs[n++] = b;
    }
    bs.length = n;
  }

  updatePicks(dt) {
    const p = this.p, ps = this.picks, mag2 = this.s.magnet * this.s.magnet;
    let n = 0;
    for (let i = 0; i < ps.length; i++) {
      const k = ps[i];
      const dx = p.x - k.x, dy = p.y - k.y, d2 = dx * dx + dy * dy;
      if (!k.mag && d2 < mag2) k.mag = true;
      if (k.mag) {
        k.sp = Math.min(900, k.sp + 1600 * dt);
        const d = Math.sqrt(d2) || 1;
        k.x += (dx / d) * k.sp * dt;
        k.y += (dy / d) * k.sp * dt;
      }
      if (d2 < 22 * 22) {
        this.collect(k);
        continue;
      }
      ps[n++] = k;
    }
    ps.length = n;
  }

  collect(k) {
    const p = this.p;
    this.emit({ t: 'pick', k: k.k });
    if (k.k === 'xp') this.gainXp(k.v);
    else if (k.k === 'heart') p.hp = Math.min(this.s.maxHp, p.hp + 30);
    else if (k.k === 'magnet') {
      for (const o of this.picks) if (o.k === 'xp' || o.k === 'dust') o.mag = true;
    } else if (k.k === 'bomb') {
      this.emit({ t: 'bomb', x: p.x, y: p.y });
      for (const e of this.enemies.slice()) {
        if (e.dead) continue;
        const dx = e.x - p.x, dy = e.y - p.y;
        if (dx * dx + dy * dy < 760 * 760) this.hit(e, e.boss ? 300 : 99999, 'bomb');
      }
      this.eshots.length = 0;
    } else if (k.k === 'chest') {
      this.pending++;
      this.pendingChest++;
    } else if (k.k === 'dust') this.dust += k.v;
  }

  // ---------------------------------------------------------------- frame

  /** Advance the world. `input` = { mx, my, dash } with (mx,my) inside the unit circle. */
  update(dt, input) {
    if (this.over) return;
    this.t += dt;
    const p = this.p, s = this.s;
    let mx = input.mx || 0, my = input.my || 0;
    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }
    p.moving = ml > 0.05;
    if (p.moving) {
      p.fx = mx / (ml > 1 ? 1 : ml);
      p.fy = my / (ml > 1 ? 1 : ml);
    }
    p.dashCd -= dt;
    if (input.dash && p.dashCd <= 0 && p.dashT <= 0) {
      p.dashT = 0.17;
      p.dashCd = 1.8;
      p.dx = p.fx;
      p.dy = p.fy;
      this.emit({ t: 'dash', x: p.x, y: p.y });
    }
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.x += p.dx * 900 * dt;
      p.y += p.dy * 900 * dt;
    } else {
      p.x += mx * s.speed * dt;
      p.y += my * s.speed * dt;
    }
    if (p.inv > 0) p.inv -= dt;
    if (s.regen && p.hp < s.maxHp) p.hp = Math.min(s.maxHp, p.hp + s.regen * dt);

    this.hash.clear();
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) this.hash.insert(es[i]);

    this.director(dt);
    this.updateWeapons(dt);
    this.updateShots(dt);
    this.updateZones(dt);
    this.updateEnemies(dt);
    this.updateEshots(dt);
    this.updatePicks(dt);
  }

  /** Ranking score: time survived, kills, level and bosses all count. */
  score() {
    return Math.floor(this.t * 10 + this.kills * 5 + this.level * 50 + this.bossIdx * 3000);
  }

  /** Stardust awarded for this run. */
  reward() {
    const base = this.dust + Math.floor(this.t / 12) + Math.floor(this.kills / 25) + this.level;
    return Math.floor(base * (this.bossIdx >= BOSSES_TO_WIN ? 1.5 : 1));
  }
}
