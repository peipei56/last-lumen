// Front end: game loop, screens, HUD, save data.
import { Game } from './game.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { botInput } from './bot.js';
import { addRank, placeOf, cleanRanks, RANK_MAX } from './ranking.js';
import { WEAPONS, PASSIVES, CHARS, META, TEXT, metaCost, WEAPON_MAX_LV, PASSIVE_MAX_LV, BOSSES_TO_WIN } from './data.js';

const $ = (id) => document.getElementById(id);
const STEP = 1 / 60;
const SAVE_KEY = 'last-lumen-save-v1';
const RUN_KEY = 'last-lumen-run-v1'; // the run in progress, so it survives closing the tab

// ------------------------------------------------------------------ save data
const save = { dust: 0, meta: {}, unlocked: {}, best: null, lang: null, sound: true, char: 'lumi', ranks: [], name: '' };
try {
  Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'));
} catch {}
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {}
}
function loadRun() {
  try {
    const d = JSON.parse(localStorage.getItem(RUN_KEY) || 'null');
    return d && d.v === 1 && CHARS[d.charId] ? d : null;
  } catch {
    return null;
  }
}
function saveRun() {
  if (!game || finalized || game.over) return;
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(game.serialize()));
  } catch {}
}
function clearRun() {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {}
}
let lang = save.lang || ((navigator.language || 'en').startsWith('ja') ? 'ja' : 'en');
const T = (k) => TEXT[lang][k] ?? k;
const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const isUnlocked = (id) => !CHARS[id].unlock || !!save.unlocked[id];
if (!CHARS[save.char] || !isUnlocked(save.char)) save.char = 'lumi';
save.ranks = cleanRanks(save.ranks);
save.name = typeof save.name === 'string' ? save.name.slice(0, 12) : '';
let latestRank = null; // the entry added by the most recent run, highlighted in the list
let lastPlace = 0;

// ------------------------------------------------------------------ systems
const canvas = $('cv');
const renderer = new Renderer(canvas);
const sound = new Sound();
sound.on = save.sound;
const input = new Input(canvas, $('stick'), $('dashBtn'));
const coarse = matchMedia('(pointer: coarse)').matches;

let mode = 'title'; // title | play | levelup | pause | dying | over
let game = null;
let demo = newDemo();
let saveT = 0;
let acc = 0, last = performance.now(), dyingT = 0, finalized = false, earned = 0, choices = [];

function newDemo() {
  const ids = Object.keys(CHARS);
  const g = new Game({ charId: ids[Math.floor(Math.random() * ids.length)], meta: { vit: 5, pow: 5 } });
  // Start the attract mode mid-battle so the title screen is alive from the first frame.
  g.t = 70;
  for (const id of ['orbit', 'nova', 'star']) if (!g.weapons.some((w) => w.id === id)) g.weapons.push({ id, lv: 3, cd: 0.5, ang: 0 });
  for (let i = 0; i < 40; i++) g.spawn(g.pickType(), ...g.ringPos(260, 700));
  return g;
}

function show(id, on) {
  $(id).hidden = !on;
}

function setMode(m) {
  mode = m;
  show('title', m === 'title');
  show('hud', m !== 'title');
  show('levelup', m === 'levelup');
  show('pause', m === 'pause');
  show('over', m === 'over');
  show('dashBtn', coarse && m === 'play');
  input.enabled = m === 'play';
  if (m !== 'play') input.endStick();
}

// ------------------------------------------------------------------ text
function applyText() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = T(el.dataset.i18n);
  $('soundBtn').textContent = `${T('sound')}: ${save.sound ? 'ON' : 'OFF'}`;
  renderTitle();
}

// ------------------------------------------------------------------ title screen
function renderTitle() {
  $('wallet').textContent = save.dust;
  const chars = $('chars');
  chars.textContent = '';
  for (const id in CHARS) {
    const c = CHARS[id], open = isUnlocked(id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'char';
    b.style.color = c.color;
    b.disabled = !open;
    b.setAttribute('aria-pressed', String(save.char === id));
    const name = document.createElement('b');
    name.textContent = `${WEAPONS[c.weapon].icon} ${T('c_' + id)}`;
    const d = document.createElement('small');
    d.textContent = open ? T('cd_' + id) : `${T('locked')} — ${T('unlock_' + c.unlock)}`;
    b.append(name, d);
    b.onclick = () => {
      save.char = id;
      persist();
      sound.init();
      sound.play('select');
      renderTitle();
    };
    chars.append(b);
  }
  const best = save.best;
  $('best').textContent = best ? `${T('best')}: ${fmtTime(best.time)} · Lv ${best.level} · ☠ ${best.kills}` : `${T('best')}: ${T('bestNone')}`;

  const susp = loadRun();
  const cb = $('continueBtn'), sb = $('startBtn');
  cb.hidden = !susp;
  $('suspNote').hidden = !susp;
  if (susp) cb.textContent = `${T('resume2')}  ${T('c_' + susp.charId)} · ${fmtTime(susp.t)} · Lv ${susp.level}`;
  sb.textContent = susp ? T('newRun') : T('start');
  sb.className = susp ? 'ghost' : 'primary';

  renderRanks();

  const shop = $('shop');
  shop.textContent = '';
  for (const id in META) {
    const m = META[id], lv = save.meta[id] || 0, cost = metaCost(id, lv);
    const row = document.createElement('div');
    row.className = 'shoprow';
    const ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = m.icon;
    const mid = document.createElement('div');
    const nm = document.createElement('div');
    nm.textContent = T('m_' + id);
    const pips = document.createElement('div');
    pips.className = 'pips';
    pips.textContent = '◆'.repeat(lv) + '◇'.repeat(m.max - lv);
    mid.append(nm, pips);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'buy-' + id;
    if (lv >= m.max) {
      btn.textContent = T('maxed');
      btn.disabled = true;
    } else {
      btn.textContent = `✦ ${cost}`;
      btn.disabled = save.dust < cost;
      btn.setAttribute('aria-label', `${T('buy')} ${T('m_' + id)} ✦${cost}`);
      btn.onclick = () => {
        if (save.dust < cost) return;
        save.dust -= cost;
        save.meta[id] = lv + 1;
        persist();
        sound.init();
        sound.play('item');
        renderTitle();
      };
    }
    row.append(ic, mid, btn);
    shop.append(row);
  }
}

function renderRanks() {
  const ol = $('ranks');
  ol.textContent = '';
  $('rankEmpty').hidden = save.ranks.length > 0;
  $('rankClearBtn').hidden = save.ranks.length === 0;
  $('rankClearBtn').textContent = T('rankClear');
  $('rankClearBtn').dataset.armed = '';
  if ($('nameInput').value !== save.name) $('nameInput').value = save.name;
  $('nameInput').placeholder = T('rankAnon');
  save.ranks.forEach((e, i) => {
    const li = document.createElement('li');
    if (e === latestRank) li.className = 'latest';
    const place = document.createElement('span');
    place.className = 'place';
    place.textContent = i + 1;
    const who = document.createElement('span');
    who.className = 'who';
    const nm = document.createElement('b');
    const c = CHARS[e.char];
    nm.textContent = `${e.won ? '★ ' : ''}${e.name || T('rankAnon')}`;
    const sub = document.createElement('small');
    const day = e.date ? new Date(e.date).toLocaleDateString(lang) : '';
    sub.textContent = `${c ? WEAPONS[c.weapon].icon + ' ' + T('c_' + e.char) : ''}${day ? ' · ' + day : ''}`;
    if (c) sub.style.color = c.color;
    who.append(nm, sub);
    const pts = document.createElement('span');
    pts.className = 'pts';
    const sc = document.createElement('b');
    sc.textContent = e.score.toLocaleString(lang);
    const det = document.createElement('small');
    det.textContent = `${fmtTime(e.time)} · Lv ${e.level} · ☠ ${e.kills}`;
    pts.append(sc, det);
    li.append(place, who, pts);
    ol.append(li);
  });
}
$('nameInput').addEventListener('input', (e) => {
  save.name = e.target.value.trim().slice(0, 12);
  persist();
});
$('nameInput').addEventListener('keydown', (e) => e.stopPropagation());
$('rankClearBtn').onclick = (e) => {
  // Two presses instead of a confirm dialog.
  const b = e.currentTarget;
  if (!b.dataset.armed) {
    b.dataset.armed = '1';
    b.textContent = T('rankClearSure');
    return;
  }
  save.ranks = [];
  save.best = null;
  latestRank = null;
  persist();
  renderTitle();
};

for (const tab of document.querySelectorAll('.tabs [data-tab]')) {
  tab.onclick = () => {
    for (const t of document.querySelectorAll('.tabs [data-tab]')) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      show('tab-' + t.dataset.tab, on);
    }
    sound.init();
    sound.play('select');
  };
}

$('langBtn').onclick = () => {
  lang = lang === 'ja' ? 'en' : 'ja';
  save.lang = lang;
  persist();
  applyText();
};
$('soundBtn').onclick = () => {
  save.sound = !save.sound;
  persist();
  sound.init();
  sound.setOn(save.sound);
  sound.startMusic();
  applyText();
};

// ------------------------------------------------------------------ run control
function beginSession() {
  renderer.parts.length = renderer.texts.length = renderer.effs.length = 0;
  finalized = false;
  acc = 0;
  saveT = 0;
  hudCache = {};
}

/** Resume the suspended run. It opens paused so the player can get their bearings. */
function continueRun() {
  const d = loadRun();
  let g = null;
  try {
    g = d && Game.restore(d);
  } catch {}
  if (!g) {
    clearRun();
    renderTitle();
    return;
  }
  sound.init();
  sound.startMusic();
  sound.play('select');
  game = g;
  beginSession();
  renderBuild($('build'));
  renderBuild($('pauseBuild'));
  updateHud();
  setMode('pause');
}

function suspendRun() {
  saveRun();
  game = null;
  demo = newDemo();
  renderTitle();
  setMode('title');
  sound.setIntensity(0.1);
}

function startRun() {
  sound.init();
  sound.startMusic();
  sound.play('levelup');
  // A suspended run is not thrown away: it ends here and its rewards are banked.
  const old = loadRun();
  if (old) {
    try {
      game = Game.restore(old);
      finalized = false;
      finalize();
    } catch {}
    clearRun();
  }
  game = new Game({ charId: save.char, meta: save.meta });
  beginSession();
  setMode('play');
  renderBuild($('build'));
  saveRun();
}
$('startBtn').onclick = startRun;
$('continueBtn').onclick = continueRun;
$('suspendBtn').onclick = suspendRun;
$('retryBtn').onclick = () => {
  finalize();
  startRun();
};
$('titleBtn').onclick = () => {
  finalize();
  demo = newDemo();
  renderTitle();
  setMode('title');
  sound.setIntensity(0.1);
};
$('endlessBtn').onclick = () => {
  game.endless = true;
  game.won = false;
  setMode('play');
};
$('pauseBtn').onclick = () => pause();
$('resumeBtn').onclick = () => setMode('play');
$('quitBtn').onclick = () => endRun(false);

function pause() {
  if (mode !== 'play') return;
  renderBuild($('pauseBuild'));
  setMode('pause');
  saveRun();
}

/** Bank the run's rewards exactly once. */
function finalize() {
  if (finalized || !game) return;
  finalized = true;
  clearRun();
  earned = game.reward();
  save.dust += earned;
  const b = save.best;
  if (!b || game.t > b.time) save.best = { time: game.t, level: game.level, kills: game.kills };
  const entry = {
    score: game.score(), time: Math.round(game.t * 10) / 10, level: game.level, kills: game.kills,
    boss: game.bossIdx, char: game.charId, won: game.bossIdx >= BOSSES_TO_WIN, name: save.name, date: Date.now(),
  };
  lastPlace = addRank(save.ranks, entry);
  latestRank = lastPlace ? entry : null;
  const newly = [];
  for (const id in CHARS) {
    const u = CHARS[id].unlock;
    if (!u || save.unlocked[id]) continue;
    if ((u === 'time300' && game.t >= 300) || (u === 'boss1' && game.bossIdx >= 1)) {
      save.unlocked[id] = true;
      newly.push(T('c_' + id));
    }
  }
  persist();
  return newly;
}

function endRun(won) {
  const g = game;
  // On a win the player may continue, so rewards are banked only when they leave or die.
  const newly = won ? [] : finalize() || [];
  $('overTitle').textContent = won ? T('win') : T('over');
  $('overTitle').style.color = won ? 'var(--gold)' : 'var(--danger)';
  show('endlessBtn', won);
  const stats = $('stats');
  stats.textContent = '';
  const rows = [[T('sScore'), g.score().toLocaleString(lang)], [T('sTime'), fmtTime(g.t)], [T('sKills'), g.kills], [T('sLevel'), g.level], [T('sDust'), '✦ ' + g.reward()]];
  // A win is banked later (the player may continue), so show where the score stands right now.
  const place = won ? placeOf(save.ranks, g.score()) : lastPlace;
  const rr = $('rankResult');
  rr.hidden = !(place >= 1 && place <= RANK_MAX);
  rr.textContent = rr.hidden ? '' : '♛ ' + T('rankIn').replace('{n}', place);
  for (const [k, v] of rows) {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = k;
    dd.textContent = v;
    stats.append(dt, dd);
  }
  const chart = $('dmgChart');
  chart.textContent = '';
  const list = Object.entries(g.dmgBy).filter(([id]) => WEAPONS[id]).sort((a, b) => b[1] - a[1]);
  const max = list.length ? list[0][1] : 1;
  for (const [id, v] of list) {
    const row = document.createElement('div');
    row.className = 'bar';
    row.style.color = WEAPONS[id].color;
    const n = document.createElement('span'), bar = document.createElement('i'), num = document.createElement('em');
    n.textContent = `${WEAPONS[id].icon} ${T('w_' + id)}`;
    bar.style.width = (v / max) * 100 + '%';
    num.textContent = v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v));
    row.append(n, bar, num);
    chart.append(row);
  }
  const note = $('unlockNote');
  note.hidden = !newly.length;
  note.textContent = newly.length ? `${T('unlocked')}: ${newly.join(' / ')}` : '';
  setMode('over');
  sound.play(won ? 'win' : 'death');
  sound.setIntensity(0.1);
}

// ------------------------------------------------------------------ level up
function describe(c) {
  if (c.type === 'weapon') return { icon: WEAPONS[c.id].icon, color: WEAPONS[c.id].color, name: T('w_' + c.id), desc: T('wd_' + c.id), tag: c.lv === 1 ? T('isNew') : `Lv ${c.lv - 1} → ${c.lv}` };
  if (c.type === 'passive') return { icon: PASSIVES[c.id].icon, color: PASSIVES[c.id].color, name: T('p_' + c.id), desc: T('pd_' + c.id), tag: c.lv === 1 ? T('isNew') : `Lv ${c.lv - 1} → ${c.lv}` };
  if (c.type === 'heal') return { icon: '✚', color: '#ff6b8f', name: T('heal'), desc: T('healD'), tag: '' };
  return { icon: '✦', color: '#ffe27a', name: T('dustUp'), desc: T('dustUpD'), tag: '' };
}

function openLevelUp(reroll = false) {
  choices = game.choices(3);
  $('luTitle').textContent = game.pendingChest > 0 ? T('chest') : `${T('levelUp')}  Lv ${game.level}`;
  const cards = $('cards');
  cards.textContent = '';
  choices.forEach((c, i) => {
    const d = describe(c);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card';
    b.id = 'card-' + i;
    b.style.color = d.color;
    const ic = document.createElement('span'), nm = document.createElement('b'), tag = document.createElement('span'), ds = document.createElement('span'), kb = document.createElement('kbd');
    ic.className = 'ic';
    ic.textContent = d.icon;
    nm.textContent = d.name;
    tag.className = 'tag';
    tag.textContent = d.tag;
    ds.className = 'desc';
    ds.textContent = d.desc;
    kb.textContent = String(i + 1);
    b.append(kb, ic, nm, tag, ds);
    b.onclick = () => choose(i);
    cards.append(b);
  });
  const rb = $('rerollBtn');
  rb.hidden = game.rerolls <= 0 || choices[0].type === 'heal';
  rb.textContent = `${T('reroll')} (${game.rerolls})`;
  if (!reroll) sound.play('levelup');
  setMode('levelup');
}

function choose(i) {
  if (mode !== 'levelup' || !choices[i]) return;
  game.apply(choices[i]);
  sound.play('select');
  renderBuild($('build'));
  if (game.pending > 0) openLevelUp();
  else {
    game.p.inv = Math.max(game.p.inv, 0.5); // a moment to get your bearings
    setMode('play');
  }
}
$('rerollBtn').onclick = () => {
  if (game.rerolls <= 0) return;
  game.rerolls--;
  sound.play('select');
  openLevelUp(true);
};

// ------------------------------------------------------------------ HUD
let hudCache = {};
function setText(id, v) {
  if (hudCache[id] !== v) {
    hudCache[id] = v;
    $(id).textContent = v;
  }
}
function setWidth(id, frac) {
  const v = Math.round(Math.max(0, Math.min(1, frac)) * 1000) / 10 + '%';
  if (hudCache[id] !== v) {
    hudCache[id] = v;
    $(id).style.width = v;
  }
}
function updateHud() {
  const g = game;
  setText('hLv', g.level);
  setText('hTime', fmtTime(g.t));
  setText('hKills', g.kills);
  setText('hDust', g.dust);
  setText('hpText', `${Math.ceil(g.p.hp)} / ${g.s.maxHp}`);
  setWidth('hpfill', g.p.hp / g.s.maxHp);
  setWidth('xpfill', g.xp / g.xpNext);
  const boss = !!g.boss;
  if (hudCache.boss !== boss) {
    hudCache.boss = boss;
    show('bossbar', boss);
  }
  if (boss) setWidth('bossfill', g.boss.hp / g.boss.maxHp);
}

function renderBuild(el) {
  el.textContent = '';
  const chip = (icon, color, lv, max, cls, title) => {
    const c = document.createElement('span');
    c.className = 'chip ' + cls;
    c.style.color = color;
    c.title = title;
    c.textContent = icon;
    const s = document.createElement('small');
    s.textContent = lv >= max ? '★' : lv;
    c.append(s);
    el.append(c);
  };
  for (const w of game.weapons) chip(WEAPONS[w.id].icon, WEAPONS[w.id].color, w.lv, WEAPON_MAX_LV, 'weapon', T('w_' + w.id));
  for (const id in game.passives) chip(PASSIVES[id].icon, PASSIVES[id].color, game.passives[id], PASSIVE_MAX_LV, 'passive', T('p_' + id));
}

let bannerTimer = 0;
function banner(text, color = 'var(--ink)') {
  const b = $('banner');
  b.hidden = true;
  void b.offsetWidth; // restart the CSS animation
  b.textContent = text;
  b.style.color = color;
  b.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => (b.hidden = true), 2600);
}

// ------------------------------------------------------------------ simulation events → sound and banners
const FX_SOUND = { dmg: 'dmg', kill: 'kill', boom: 'boom', ring: 'ring', arc: 'arc', beam: 'beam', shoot: 'shoot', hurt: 'hurt', dash: 'dash', eshoot: 'eshoot', charge: 'charge', boss: 'boss', bossdie: 'bossdie', bomb: 'boom', revive: 'bossdie' };
function handleFx(fx) {
  for (const e of fx) {
    if (e.t === 'pick') sound.play(e.k === 'xp' ? 'pick' : 'item');
    else if (e.t === 'bosswarn') {
      sound.play('warn');
      banner(T('bossWarn'), 'var(--danger)');
    } else if (e.t === 'swarm') banner(T('swarm'), 'var(--gold)');
    else if (FX_SOUND[e.t]) sound.play(FX_SOUND[e.t]);
    if (e.t === 'bossdie') banner(T('bossDown'), 'var(--gold)');
    if (e.t === 'revive') banner(T('revived'), 'var(--lumen)');
  }
}

// ------------------------------------------------------------------ main loop
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mode === 'title') {
    acc += dt;
    while (acc >= STEP) {
      acc -= STEP;
      demo.update(STEP, botInput(demo));
      renderer.consume(demo.fx);
      demo.fx.length = 0;
      while (demo.pending > 0) demo.apply(demo.choices(3)[0]);
      if (demo.over || demo.won || demo.t > 300) demo = newDemo();
    }
    renderer.step(dt);
    renderer.draw(demo);
    return;
  }
  if (mode === 'play') {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps++ < 5 && mode === 'play') {
      acc -= STEP;
      game.update(STEP, input.read());
      renderer.consume(game.fx);
      handleFx(game.fx);
      game.fx.length = 0;
      if (game.over) {
        mode = 'dying';
        dyingT = 1.3;
        input.enabled = false;
        show('dashBtn', false);
        sound.play('death');
      } else if (game.won && !game.endless) endRun(true);
      else if (game.pending > 0) openLevelUp();
    }
    if (acc > STEP * 5) acc = 0;
    if (input.padStart) pause();
    saveT += dt;
    if (saveT >= 8) {
      saveT = 0;
      saveRun();
    }
    sound.setIntensity(0.25 + Math.min(0.6, game.t / 600) + (game.boss ? 0.2 : 0));
    updateHud();
  } else if (mode === 'dying') {
    dyingT -= dt;
    if (dyingT <= 0) endRun(false);
  }
  if (mode === 'play' || mode === 'dying') renderer.step(dt);
  renderer.draw(game);
}

// ------------------------------------------------------------------ global input
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'play') pause();
    else if (mode === 'pause') setMode('play');
  } else if (mode === 'levelup') {
    const i = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code);
    if (i >= 0) choose(i % 3);
    else if (e.code === 'KeyR' && !$('rerollBtn').hidden) $('rerollBtn').click();
  } else if (e.code === 'Enter' && !['BUTTON', 'INPUT'].includes(document.activeElement?.tagName)) {
    if (mode === 'title') (loadRun() ? continueRun : startRun)();
    else if (mode === 'over') $('retryBtn').click();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    saveRun();
  }
  last = performance.now();
});
window.addEventListener('pagehide', saveRun);
window.addEventListener('resize', () => renderer.resize());
if (typeof ResizeObserver === 'function') new ResizeObserver(() => renderer.resize()).observe(canvas);
// Browsers only allow audio after a gesture, so the title music starts on the first tap or key.
const firstGesture = () => {
  sound.init();
  sound.startMusic();
  sound.setIntensity(0.1);
  window.removeEventListener('pointerdown', firstGesture);
  window.removeEventListener('keydown', firstGesture);
};
window.addEventListener('pointerdown', firstGesture);
window.addEventListener('keydown', firstGesture);

applyText();
setMode('title');
requestAnimationFrame(frame);

// Exposed for debugging and automated browser checks.
window.__lumen = { get game() { return game; }, get mode() { return mode; }, save, BOSSES_TO_WIN };
