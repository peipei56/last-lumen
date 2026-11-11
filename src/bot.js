// A simple autopilot. It drives the attract mode behind the title screen and the headless tests.
export function botInput(g) {
  const p = g.p;
  let ax = 0, ay = 0, danger = 1e9;
  for (const e of g.enemies) {
    const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy;
    if (d2 > 300 * 300) continue;
    const d = Math.sqrt(d2) || 1, gap = Math.max(8, d - e.r - p.r);
    const w = (e.boss ? 9000 : 2600) / (gap * gap);
    ax += (dx / d) * w;
    ay += (dy / d) * w;
    if (gap < danger) danger = gap;
  }
  for (const b of g.eshots) {
    const dx = p.x - b.x, dy = p.y - b.y, d2 = dx * dx + dy * dy;
    if (d2 > 130 * 130) continue;
    const d = Math.sqrt(d2) || 1;
    // Step sideways out of the bullet's path rather than straight back.
    const side = dx * b.vy - dy * b.vx > 0 ? 1 : -1;
    const sp = Math.hypot(b.vx, b.vy) || 1;
    ax += ((b.vy / sp) * side * 2400) / d2 * 40;
    ay += ((-b.vx / sp) * side * 2400) / d2 * 40;
  }
  // Drift toward the nearest pickup when it is safe.
  let best = null, bd = 420 * 420;
  for (const k of g.picks) {
    const dx = k.x - p.x, dy = k.y - p.y, d2 = dx * dx + dy * dy;
    if (d2 < bd) {
      bd = d2;
      best = k;
    }
  }
  if (best) {
    const d = Math.sqrt(bd) || 1, w = danger > 70 ? 0.9 : 0.25;
    ax += ((best.x - p.x) / d) * w;
    ay += ((best.y - p.y) / d) * w;
  }
  // A slow orbit keeps it from standing still.
  ax += Math.cos(g.t * 0.35) * 0.15;
  ay += Math.sin(g.t * 0.35) * 0.15;
  const l = Math.hypot(ax, ay) || 1;
  return { mx: ax / l, my: ay / l, dash: danger < 14 };
}
