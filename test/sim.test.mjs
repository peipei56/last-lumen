// Headless checks: the simulation must stay finite, deterministic and fast across full bot-driven runs.
// Run with:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { botInput } from '../src/bot.js';
import { addRank, placeOf, cleanRanks, RANK_MAX } from '../src/ranking.js';
import { WEAPONS, PASSIVES, wstat, TEXT, CHARS, META, WEAPON_MAX_LV } from '../src/data.js';

export function run(seed, charId = 'lumi', maxT = 900, meta = {}) {
  const g = new Game({ seed, charId, meta });
  const dt = 1 / 60;
  let peak = 0;
  while (!g.over && g.t < maxT) {
    g.update(dt, botInput(g));
    g.fx.length = 0;
    while (g.pending > 0) g.apply(g.choices(3)[0]);
    if (g.won && !g.endless) g.endless = true;
    if (g.enemies.length > peak) peak = g.enemies.length;
  }
  return { g, peak };
}

test('runs stay finite for every character', () => {
  for (const charId of Object.keys(CHARS)) {
    const { g } = run(1234, charId, 400);
    const p = g.p;
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.hp), charId + ' player state');
    for (const e of g.enemies) assert.ok(Number.isFinite(e.x + e.y + e.hp), charId + ' enemy state');
    assert.ok(g.kills > 0, charId + ' should kill something');
    assert.ok(g.level > 1, charId + ' should level up');
  }
});

test('same seed gives the same run', () => {
  const a = run(77, 'lumi', 120).g, b = run(77, 'lumi', 120).g;
  assert.equal(a.kills, b.kills);
  assert.equal(a.p.x, b.p.x);
  assert.equal(a.level, b.level);
});

test('every weapon fires and deals damage', () => {
  for (const id of Object.keys(WEAPONS)) {
    const g = new Game({ seed: 5 });
    g.weapons = [{ id, lv: WEAPON_MAX_LV, cd: 0, ang: 0 }];
    for (let i = 0; i < 60 * 40; i++) {
      g.update(1 / 60, { mx: 0, my: 0, dash: false }); // stand still so melee-range weapons connect
      g.fx.length = 0;
      while (g.pending > 0) g.apply({ type: 'heal' });
      g.p.hp = g.s.maxHp;
    }
    assert.ok((g.dmgBy[id] || 0) > 0, id + ' dealt no damage');
  }
});

test('weapon tables are sane at every level', () => {
  for (const id of Object.keys(WEAPONS)) {
    for (let lv = 1; lv <= WEAPON_MAX_LV; lv++) {
      const s = wstat(id, lv);
      assert.ok(s.dmg > 0);
      if (s.cd !== undefined) assert.ok(s.cd > 0.2, `${id} lv${lv} cooldown ${s.cd}`);
    }
  }
});

test('upgrade choices are distinct and eventually run out', () => {
  const g = new Game({ seed: 9 });
  for (let i = 0; i < 200; i++) {
    const c = g.choices(3);
    const keys = c.map((x) => x.type + (x.id || ''));
    assert.equal(new Set(keys).size, keys.length);
    g.apply(c[0]);
  }
  assert.equal(g.choices(3)[0].type, 'heal');
  assert.equal(g.weapons.length, 5);
});

test('both languages define the same strings, including all content names', () => {
  const ja = Object.keys(TEXT.ja).sort(), en = Object.keys(TEXT.en).sort();
  assert.deepEqual(ja, en);
  for (const id in WEAPONS) assert.ok(TEXT.ja['w_' + id] && TEXT.ja['wd_' + id], id);
  for (const id in PASSIVES) assert.ok(TEXT.ja['p_' + id] && TEXT.ja['pd_' + id], id);
  for (const id in CHARS) assert.ok(TEXT.ja['c_' + id] && TEXT.ja['cd_' + id], id);
  for (const id in META) assert.ok(TEXT.ja['m_' + id], id);
});

test('a full 15 minute run simulates far faster than real time', () => {
  const t0 = performance.now();
  const { g, peak } = run(42, 'lumi', 900, { vit: 5, pow: 5, rev: 1 });
  const ms = performance.now() - t0;
  assert.ok(peak <= 460, 'enemy cap respected, peak ' + peak);
  assert.ok(ms < g.t * 1000 * 0.5, `sim too slow: ${ms.toFixed(0)}ms for ${g.t.toFixed(0)}s`);
});

test('score grows with the run and is an integer', () => {
  const a = run(3, 'lumi', 30).g, b = run(3, 'lumi', 120).g;
  assert.ok(Number.isInteger(a.score()) && a.score() > 0);
  assert.ok(b.score() > a.score());
});

test('ranking keeps the top runs in order', () => {
  const list = [];
  assert.equal(addRank(list, { score: 500, time: 1 }), 1);
  assert.equal(addRank(list, { score: 900, time: 1 }), 1);
  assert.equal(addRank(list, { score: 700, time: 1 }), 2);
  assert.equal(addRank(list, { score: 700, time: 2 }), 3, 'a tie ranks below the earlier run');
  assert.deepEqual(list.map((e) => e.score), [900, 700, 700, 500]);
  for (let i = 0; i < 20; i++) addRank(list, { score: 1000 + i, time: 1 });
  assert.equal(list.length, RANK_MAX);
  assert.equal(list[0].score, 1019);
  assert.equal(addRank(list, { score: 1 , time: 1 }), 0, 'a low score does not make a full list');
  assert.equal(placeOf(list, 99999), 1);
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].score >= list[i].score);
});

test('damaged ranking data is cleaned up', () => {
  assert.deepEqual(cleanRanks('nope'), []);
  const out = cleanRanks([{ score: 5, time: 1 }, null, { score: 'x' }, { score: 9, time: 2 }]);
  assert.deepEqual(out.map((e) => e.score), [9, 5]);
});
