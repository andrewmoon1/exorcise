// Rest timer shown above the bottom bar. Uses an end time, not a counter,
// so it stays correct if the phone locks or the screen re-renders.

import { h } from './dom.js';
import { formatClock } from '../domain/model.js';

export function createRestTimer(el) {
  let endsAt = 0;
  let label = '';
  let tick = null;
  let audio = null;

  function unlockAudio() {
    // Browsers only allow sound after a tap, so prepare it on each tap.
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch { /* no sound available */ }
  }

  function beep() {
    try {
      navigator.vibrate?.([250, 120, 250]);
      if (!audio) return;
      for (const [at, freq] of [[0, 880], [0.25, 880], [0.5, 1320]]) {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.2, audio.currentTime + at);
        g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + at + 0.2);
        o.connect(g).connect(audio.destination);
        o.start(audio.currentTime + at);
        o.stop(audio.currentTime + at + 0.2);
      }
    } catch { /* ignore */ }
  }

  function render() {
    const left = (endsAt - Date.now()) / 1000;
    if (left <= 0) {
      stop();
      beep();
      el.replaceChildren(h('div', { class: 'timer-bar go' }, h('strong', {}, 'Rest over. Go!')));
      el.hidden = false;
      setTimeout(() => { if (!tick) el.hidden = true; }, 3000);
      return;
    }
    el.hidden = false;
    el.replaceChildren(h('div', { class: 'timer-bar', role: 'timer' },
      h('div', { class: 'timer-text' },
        h('span', { class: 'timer-clock' }, formatClock(left)),
        h('span', { class: 'timer-label' }, label)),
      h('button', { class: 'timer-btn', type: 'button', 'aria-label': 'Rest 15 seconds less', onclick: () => adjust(-15) }, '−15'),
      h('button', { class: 'timer-btn', type: 'button', 'aria-label': 'Rest 15 seconds more', onclick: () => adjust(15) }, '+15'),
      h('button', { class: 'timer-btn', type: 'button', onclick: () => { stop(); el.hidden = true; } }, 'Skip')));
  }

  function adjust(sec) {
    endsAt += sec * 1000;
    render();
  }

  function stop() {
    clearInterval(tick);
    tick = null;
  }

  return {
    unlockAudio,
    start(seconds, text) {
      if (!seconds) return;
      stop();
      endsAt = Date.now() + seconds * 1000;
      label = text;
      tick = setInterval(render, 250);
      render();
    },
    cancel() { stop(); el.hidden = true; },
    get running() { return Boolean(tick); },
  };
}
