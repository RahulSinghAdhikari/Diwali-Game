/**
 * SCREEN MANAGER — one visible screen at a time with a consistent
 * fade + slight-scale transition (380ms in, 260ms out).
 */

import { $$ } from './utils.js';

export class ScreenManager {
  constructor(root) {
    this.root = root;
    this.screens = new Map();
    $$('[data-screen]', root).forEach((el) => this.screens.set(el.dataset.screen, el));
    this.current = null;
    this.history = [];
    this._timer = null;
    this.onChange = null;
  }

  get(name) { return this.screens.get(name); }

  /** @returns {Promise<void>} resolves once the incoming screen is settled. */
  show(name, { instant = false } = {}) {
    const next = this.screens.get(name);
    if (!next || this.current === name) return Promise.resolve();

    const prevName = this.current;
    const prev = prevName ? this.screens.get(prevName) : null;
    this.current = name;
    if (prevName) this.history.push(prevName);

    clearTimeout(this._timer);

    if (prev) {
      prev.classList.remove('is-entering');
      if (instant) {
        prev.classList.remove('is-active', 'is-leaving');
      } else {
        prev.classList.add('is-leaving');
        setTimeout(() => {
          prev.classList.remove('is-active', 'is-leaving');
        }, 260);
      }
    }

    next.classList.add('is-active');
    if (!instant) {
      next.classList.remove('is-entering');
      void next.offsetWidth;          // restart the animation
      next.classList.add('is-entering');
    }
    next.scrollTop = 0;
    const scroller = next.querySelector('.sheet__scroll, .home__scroll');
    if (scroller) scroller.scrollTop = 0;

    this.onChange?.(name, prevName);

    return new Promise((resolve) => {
      this._timer = setTimeout(() => {
        next.classList.remove('is-entering');
        resolve();
      }, instant ? 0 : 380);
    });
  }

  back(fallback = 'home') {
    const prev = this.history.pop();
    // pop twice: show() pushed the screen we are leaving
    const target = this.history.pop() || prev || fallback;
    return this.show(target);
  }
}
