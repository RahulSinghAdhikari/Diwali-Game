/**
 * HUD — stage name, live score, countdown, mission progress and combo.
 * All writes are diffed so the animation loop never touches layout needlessly.
 */

import { formatInt, clamp } from './core/utils.js';

export class Hud {
  constructor(root) {
    this.root = root;
    this.el = {
      stageNum: root.querySelector('#hud-stagenum'),
      stageName: root.querySelector('#hud-stagename'),
      score: root.querySelector('#hud-score'),
      timerBar: root.querySelector('#hud-timerbar'),
      timerText: root.querySelector('#hud-timertext'),
      timerWrap: root.querySelector('.hud__timer'),
      missionLabel: root.querySelector('#hud-missionlabel'),
      missionNow: root.querySelector('#hud-missionnow'),
      missionGoal: root.querySelector('#hud-missiongoal'),
      missionVal: root.querySelector('.hud__missionval'),
      combo: root.querySelector('#hud-combo'),
      comboX: root.querySelector('#hud-combox'),
      comboTag: root.querySelector('#hud-combotag')
    };
    this._score = -1;
    this._timeText = '';
    this._low = false;
    this._bumpTimer = null;
  }

  setStage(def) {
    this.el.stageNum.textContent = `STAGE ${def.index + 1}/5`;
    this.el.stageName.textContent = def.name;
    this.el.missionLabel.textContent = def.missionLabel;
    this.el.missionGoal.textContent = def.id === 'boss-battle' ? '100%' : def.missionGoal;
    this.el.missionNow.textContent = '0';
    this.el.missionVal.classList.remove('is-done');
    this.setCombo({ count: 0, mult: 1, level: 0, tag: null });
    this.setTime(def.duration, def.duration);
  }

  setScore(value, { bump = true } = {}) {
    if (value === this._score) return;
    this._score = value;
    this.el.score.textContent = formatInt(value);
    if (!bump) return;
    this.el.score.classList.add('is-bump');
    clearTimeout(this._bumpTimer);
    this._bumpTimer = setTimeout(() => this.el.score.classList.remove('is-bump'), 140);
  }

  setTime(left, total) {
    const ratio = total > 0 ? clamp(left / total, 0, 1) : 0;
    this.el.timerBar.style.transform = `scaleX(${ratio})`;
    const text = left >= 10 ? left.toFixed(0) : left.toFixed(1);
    if (text !== this._timeText) {
      this._timeText = text;
      this.el.timerText.textContent = text;
    }
    const low = left <= 5;
    if (low !== this._low) {
      this._low = low;
      this.el.timerWrap.classList.toggle('is-low', low);
    }
  }

  setMission(info, { boss = false } = {}) {
    this.el.missionNow.textContent = boss ? `${info.now}%` : info.now;
    this.el.missionVal.classList.toggle('is-done', Boolean(info.done));
  }

  setCombo(info) {
    this.el.combo.dataset.level = String(info.level || 0);
    this.el.comboX.textContent = `×${info.mult}`;
    if (info.tag) this.el.comboTag.textContent = info.tag;
    else if (!info.level) this.el.comboTag.textContent = '';
  }

  flash() {
    const el = this.root.parentElement?.querySelector('#stage-flash');
    if (!el) return;
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
  }
}
