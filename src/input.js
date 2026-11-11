// Keyboard, touch (floating stick) and gamepad, merged into one { mx, my, dash } reading.
export class Input {
  constructor(canvas, stickEl, dashBtn) {
    this.keys = new Set();
    this.stick = null; // { id, ox, oy, x, y }
    this.touchDash = false;
    this.stickEl = stickEl;
    this.enabled = false;
    const block = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
    window.addEventListener('keydown', (e) => {
      if (this.enabled && block.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.endStick();
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.stick) return;
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
      stickEl.hidden = false;
      stickEl.style.left = e.clientX + 'px';
      stickEl.style.top = e.clientY + 'px';
      stickEl.firstElementChild.style.transform = 'translate(-50%,-50%)';
    });
    canvas.addEventListener('pointermove', (e) => {
      const s = this.stick;
      if (!s || s.id !== e.pointerId) return;
      let dx = e.clientX - s.ox, dy = e.clientY - s.oy;
      const d = Math.hypot(dx, dy), max = 56;
      if (d > max) {
        dx = (dx / d) * max;
        dy = (dy / d) * max;
      }
      s.x = dx / max;
      s.y = dy / max;
      stickEl.firstElementChild.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const up = (e) => {
      if (this.stick && this.stick.id === e.pointerId) this.endStick();
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    dashBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touchDash = true;
    });
    const off = () => (this.touchDash = false);
    dashBtn.addEventListener('pointerup', off);
    dashBtn.addEventListener('pointerleave', off);
    dashBtn.addEventListener('pointercancel', off);
  }

  endStick() {
    this.stick = null;
    this.stickEl.hidden = true;
  }

  read() {
    const k = this.keys;
    let mx = 0, my = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
    let dash = k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight') || this.touchDash;
    if (this.stick && Math.hypot(this.stick.x, this.stick.y) > 0.12) {
      mx = this.stick.x;
      my = this.stick.y;
    }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.2) {
        mx = ax;
        my = ay;
      }
      if (gp.buttons[0]?.pressed || gp.buttons[1]?.pressed || gp.buttons[7]?.pressed) dash = true;
      this.padStart = !!gp.buttons[9]?.pressed;
    }
    return { mx, my, dash };
  }
}
