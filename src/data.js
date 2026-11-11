// All tunable content lives here: weapons, passives, enemies, characters, shop and text.

export const MAX_WEAPONS = 5;
export const MAX_PASSIVES = 5;
export const WEAPON_MAX_LV = 6;
export const PASSIVE_MAX_LV = 5;
export const BOSS_INTERVAL = 180; // seconds
export const BOSSES_TO_WIN = 4;

export const WEAPONS = {
  bolt: { icon: '✦', color: '#7fe9ff' },
  orbit: { icon: '◈', color: '#ffd36b' },
  nova: { icon: '◎', color: '#b48cff' },
  arc: { icon: 'ϟ', color: '#9fd0ff' },
  lance: { icon: '╱', color: '#ff7ad9' },
  star: { icon: '☄', color: '#ffa15c' },
  drone: { icon: '➤', color: '#7dffb0' },
  mine: { icon: '✹', color: '#ff7b6b' },
};

/** Per-level numbers for a weapon. `lv` is 1..WEAPON_MAX_LV. */
export function wstat(id, lv) {
  const h = Math.floor(lv / 2);
  switch (id) {
    case 'bolt':
      return { cd: 0.52, dmg: 11 + 4 * lv, count: 1 + h, pierce: Math.floor((lv - 1) / 2), speed: 640 };
    case 'orbit':
      return { dmg: 8 + 3 * lv, count: Math.min(6, 1 + lv), radius: 72 + 7 * lv, size: 13, rot: 2.6 + 0.15 * lv };
    case 'nova':
      return { cd: 3.1 - 0.2 * lv, dmg: 18 + 8 * lv, radius: 115 + 17 * lv };
    case 'arc':
      return { cd: 1.5 - 0.1 * lv, dmg: 15 + 6 * lv, chains: 2 + lv, range: 330, jump: 190 };
    case 'lance':
      return { cd: 2.3 - 0.15 * lv, dmg: 28 + 12 * lv, width: 16 + 3 * lv, len: 720, beams: lv >= 6 ? 3 : lv >= 3 ? 2 : 1 };
    case 'star':
      return { cd: 1.9 - 0.12 * lv, dmg: 26 + 10 * lv, count: 1 + h, radius: 62 + 6 * lv };
    case 'drone':
      return { cd: 1.25 - 0.08 * lv, dmg: 13 + 5 * lv, count: 1 + Math.floor(lv / 3), speed: 360, blast: 46 + 3 * lv };
    case 'mine':
      return { cd: 1.1 - 0.08 * lv, dmg: 24 + 9 * lv, radius: 72 + 7 * lv };
  }
  throw new Error('unknown weapon ' + id);
}

export const PASSIVES = {
  might: { icon: '⚔', color: '#ff9c7a' },
  haste: { icon: '⏱', color: '#7fe9ff' },
  swift: { icon: '»', color: '#a8ff8c' },
  vital: { icon: '♥', color: '#ff6b8f' },
  magnet: { icon: '⊛', color: '#8cb4ff' },
  amp: { icon: '⬡', color: '#d79bff' },
  fortune: { icon: '✧', color: '#ffe27a' },
  aegis: { icon: '⛨', color: '#b9c6d8' },
  lumen: { icon: '☼', color: '#fff3c4' },
};

// shape = polygon side count (0 = circle)
export const ENEMIES = {
  wisp: { hp: 10, spd: 92, r: 11, dmg: 8, xp: 1, color: '#ff5c7a', shape: 0, ai: 'chase' },
  mite: { hp: 7, spd: 135, r: 7, dmg: 6, xp: 1, color: '#6fb6ff', shape: 3, ai: 'chase' },
  darter: { hp: 16, spd: 78, r: 10, dmg: 12, xp: 2, color: '#ffb14a', shape: 3, ai: 'dart' },
  brute: { hp: 62, spd: 54, r: 20, dmg: 16, xp: 4, color: '#c653ff', shape: 4, ai: 'chase' },
  spitter: { hp: 26, spd: 72, r: 13, dmg: 8, xp: 3, color: '#5cff9d', shape: 5, ai: 'spit' },
  splitter: { hp: 44, spd: 76, r: 17, dmg: 12, xp: 3, color: '#5ca8ff', shape: 6, ai: 'chase' },
  wraith: { hp: 85, spd: 118, r: 14, dmg: 18, xp: 6, color: '#e6ebff', shape: 8, ai: 'chase' },
  boss: { hp: 2000, spd: 62, r: 46, dmg: 22, xp: 60, color: '#ff3d6e', shape: 7, ai: 'boss' },
};

/** Spawn weights by elapsed minutes. */
export function spawnTable(m) {
  const t = [['wisp', 10]];
  if (m >= 0.75) t.push(['darter', 3]);
  if (m >= 1.75) t.push(['brute', 2 + m * 0.3]);
  if (m >= 3) t.push(['spitter', 2.5]);
  if (m >= 4) t.push(['splitter', 2.5]);
  if (m >= 6) t.push(['wraith', 1 + (m - 6) * 0.8]);
  return t;
}

export const CHARS = {
  lumi: { weapon: 'bolt', color: '#7fe9ff', mods: {} },
  orbis: { weapon: 'orbit', color: '#ffd36b', mods: { hp: 30, speed: 0.94 } },
  volt: { weapon: 'arc', color: '#9fd0ff', mods: { cd: 0.9, hp: -20 }, unlock: 'time300' },
  nyx: { weapon: 'lance', color: '#ff7ad9', mods: { crit: 0.15, speed: 1.05 }, unlock: 'boss1' },
};

// Permanent upgrades bought with stardust between runs.
export const META = {
  vit: { max: 5, cost: 30, icon: '♥' },
  pow: { max: 5, cost: 40, icon: '⚔' },
  spd: { max: 5, cost: 30, icon: '»' },
  xp: { max: 5, cost: 40, icon: '☼' },
  mag: { max: 3, cost: 35, icon: '⊛' },
  rer: { max: 3, cost: 60, icon: '⟳' },
  rev: { max: 1, cost: 300, icon: '✚' },
};
export const metaCost = (id, lv) => META[id].cost * (lv + 1);

export const xpFor = (lv) => Math.floor(4 + lv * 5 + Math.pow(lv, 1.8));

export const TEXT = {
  ja: {
    tagline: '闇に呑まれた宙域で、最後の光として生き残れ。',
    start: '出撃',
    tabRun: '出撃', tabShop: '強化', tabHelp: '遊び方',
    chooseChar: '光核を選ぶ',
    locked: '未解放',
    unlock_time300: '5分生存で解放',
    unlock_boss1: '最初の蝕を撃破で解放',
    dust: '星屑',
    best: '最高記録',
    bestNone: '記録なし',
    shopLead: '星屑は出撃のたびに手に入る。強化は永続する。',
    buy: '強化', maxed: '最大',
    help1: '移動：WASD / 矢印キー / 画面をドラッグ / ゲームパッド',
    help2: 'ダッシュ：Space / Shift / DASHボタン（一瞬だけ無敵）',
    help3: '攻撃は自動。光の欠片を集めてレベルを上げ、武器とパッシブを選ぶ。',
    help4: '3分ごとに「蝕」が現れる。4体倒せば夜明け。',
    help5: '一時停止：Esc / P　　選択：1・2・3キー',
    sound: '音', lang: 'English',
    levelUp: 'レベルアップ', chest: '光の遺物',
    pick: '1つ選ぶ',
    reroll: '引き直す',
    isNew: 'NEW',
    paused: '一時停止', resume: '再開', giveUp: 'あきらめる',
    over: '光は消えた', win: '夜明け', endless: 'このまま続ける（エンドレス）',
    retry: 'もう一度', toTitle: 'タイトルへ',
    sTime: '生存時間', sKills: '撃破', sLevel: 'レベル', sDust: '獲得した星屑',
    dmgBy: '武器別ダメージ',
    boss: '蝕',
    bossWarn: '蝕が近づいている', bossDown: '蝕を撃破', swarm: '群れが来る',
    revived: '光核が再点火した', unlocked: '解放',
    heal: '応急修復', healD: 'HPを50回復する',
    dustUp: '星屑の塊', dustUpD: '星屑を15手に入れる',
    w_bolt: 'フォトンボルト', wd_bolt: '最も近い敵へ光弾を撃つ。レベルで弾数と貫通が増える。',
    w_orbit: 'オービットシャード', wd_orbit: '周囲を回る光の刃。触れた敵を斬り続ける。',
    w_nova: 'ノヴァパルス', wd_nova: '一定間隔で全周に衝撃波。敵を押し返す。',
    w_arc: 'アークチェイン', wd_arc: '敵から敵へ連鎖する雷。群れに強い。',
    w_lance: 'プリズムランス', wd_lance: '直線上のすべてを貫く光線。Lv3と6で本数が増える。',
    w_star: 'スターフォール', wd_star: '敵の頭上に流星を落とす。範囲ダメージ。',
    w_drone: 'シーカードローン', wd_drone: '敵を追尾して爆発する小型弾。',
    w_mine: 'ヘイローマイン', wd_mine: '足元に地雷を置く。逃げながら戦うときに。',
    p_might: '威力', pd_might: '与えるダメージ +12%',
    p_haste: '加速', pd_haste: '武器のクールダウン -7%',
    p_swift: '俊足', pd_swift: '移動速度 +8%',
    p_vital: '生命', pd_vital: '最大HP +20、毎秒 0.3 回復',
    p_magnet: '引力', pd_magnet: '欠片を拾う範囲 +30%',
    p_amp: '増幅', pd_amp: '攻撃範囲 +10%',
    p_fortune: '幸運', pd_fortune: 'クリティカル率 +7%（2倍ダメージ）',
    p_aegis: '装甲', pd_aegis: '受けるダメージを 1.5 軽減',
    p_lumen: '光輝', pd_lumen: '視界が広がり、経験値 +8%',
    c_lumi: 'ルミ', cd_lumi: 'バランス型。初期武器：フォトンボルト',
    c_orbis: 'オルビス', cd_orbis: '頑丈で少し遅い。初期武器：オービットシャード',
    c_volt: 'ヴォルト', cd_volt: '連射が速く打たれ弱い。初期武器：アークチェイン',
    c_nyx: 'ニクス', cd_nyx: '速く、会心が出やすい。初期武器：プリズムランス',
    m_vit: '最大HP +10', m_pow: 'ダメージ +5%', m_spd: '移動速度 +3%', m_xp: '経験値 +5%',
    m_mag: '回収範囲 +10%', m_rer: '引き直し +1回', m_rev: '1度だけ復活する',
  },
  en: {
    tagline: 'The void has swallowed everything. Be the last light.',
    start: 'Launch',
    tabRun: 'Launch', tabShop: 'Upgrades', tabHelp: 'How to play',
    chooseChar: 'Choose a core',
    locked: 'Locked',
    unlock_time300: 'Survive 5 minutes',
    unlock_boss1: 'Defeat the first Eclipse',
    dust: 'Stardust',
    best: 'Best run',
    bestNone: 'No record yet',
    shopLead: 'You earn stardust on every run. Upgrades are permanent.',
    buy: 'Buy', maxed: 'Max',
    help1: 'Move: WASD / arrow keys / drag the screen / gamepad',
    help2: 'Dash: Space / Shift / DASH button (briefly invulnerable)',
    help3: 'Weapons fire on their own. Collect shards to level up and pick upgrades.',
    help4: 'An Eclipse arrives every 3 minutes. Defeat four to see the dawn.',
    help5: 'Pause: Esc / P     Pick: keys 1, 2, 3',
    sound: 'Sound', lang: '日本語',
    levelUp: 'Level up', chest: 'Relic of light',
    pick: 'Pick one',
    reroll: 'Reroll',
    isNew: 'NEW',
    paused: 'Paused', resume: 'Resume', giveUp: 'Give up',
    over: 'The light went out', win: 'Dawn', endless: 'Keep going (endless)',
    retry: 'Try again', toTitle: 'Title',
    sTime: 'Time survived', sKills: 'Kills', sLevel: 'Level', sDust: 'Stardust earned',
    dmgBy: 'Damage by weapon',
    boss: 'ECLIPSE',
    bossWarn: 'An Eclipse approaches', bossDown: 'Eclipse defeated', swarm: 'A swarm is coming',
    revived: 'Your core reignited', unlocked: 'Unlocked',
    heal: 'Field repair', healD: 'Restore 50 HP',
    dustUp: 'Stardust cluster', dustUpD: 'Gain 15 stardust',
    w_bolt: 'Photon Bolt', wd_bolt: 'Fires at the nearest enemy. Levels add bolts and pierce.',
    w_orbit: 'Orbit Shards', wd_orbit: 'Blades of light circle you and cut whatever they touch.',
    w_nova: 'Nova Pulse', wd_nova: 'A shockwave in every direction that pushes enemies back.',
    w_arc: 'Arc Chain', wd_arc: 'Lightning that jumps from enemy to enemy. Strong against crowds.',
    w_lance: 'Prism Lance', wd_lance: 'A beam that pierces everything in a line. More beams at Lv 3 and 6.',
    w_star: 'Starfall', wd_star: 'Drops meteors on enemies for area damage.',
    w_drone: 'Seeker Drones', wd_drone: 'Small homing shots that explode on impact.',
    w_mine: 'Halo Mines', wd_mine: 'Leaves mines where you stand. Good while retreating.',
    p_might: 'Might', pd_might: 'Damage +12%',
    p_haste: 'Haste', pd_haste: 'Weapon cooldown -7%',
    p_swift: 'Swiftness', pd_swift: 'Move speed +8%',
    p_vital: 'Vitality', pd_vital: 'Max HP +20, regenerate 0.3 per second',
    p_magnet: 'Magnet', pd_magnet: 'Pickup range +30%',
    p_amp: 'Amplify', pd_amp: 'Attack area +10%',
    p_fortune: 'Fortune', pd_fortune: 'Crit chance +7% (double damage)',
    p_aegis: 'Aegis', pd_aegis: 'Reduce damage taken by 1.5',
    p_lumen: 'Luminance', pd_lumen: 'Wider vision and XP +8%',
    c_lumi: 'Lumi', cd_lumi: 'Balanced. Starts with Photon Bolt',
    c_orbis: 'Orbis', cd_orbis: 'Sturdy but a little slow. Starts with Orbit Shards',
    c_volt: 'Volt', cd_volt: 'Fast-firing and fragile. Starts with Arc Chain',
    c_nyx: 'Nyx', cd_nyx: 'Quick, with frequent crits. Starts with Prism Lance',
    m_vit: 'Max HP +10', m_pow: 'Damage +5%', m_spd: 'Move speed +3%', m_xp: 'XP +5%',
    m_mag: 'Pickup range +10%', m_rer: 'Reroll +1', m_rev: 'Revive once per run',
  },
};
