// Small SVG charts with no libraries: a line chart over time and a bar chart.
// Each chart draws at the real width of its box and draws again when the box
// changes size. Tap or drag on a chart to read one point; the readout line
// above the chart shows it, so nothing is hidden under a finger.

import { h } from './dom.js';
import { parseISODate } from '../domain/dates.js';

const NS = 'http://www.w3.org/2000/svg';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HEIGHT = 190;
const PAD = { top: 12, right: 12, bottom: 26, left: 40 };

function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

/** Round numbers for the value axis: about `count` steps from 0 or near the lowest value. */
export function niceTicks(lo, hi, count = 4) {
  if (hi <= lo) { hi = lo + 1; lo = Math.max(0, lo - 1); }
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw);
  const start = Math.floor(lo / step) * step;
  const ticks = [];
  for (let v = start; v <= hi + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  if (ticks.at(-1) < hi) ticks.push(Math.round((ticks.at(-1) + step) * 100) / 100);
  return ticks;
}

function fmt(n) {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`;
  return String(Math.round(n * 10) / 10);
}

const dayNum = (iso) => parseISODate(iso).getTime() / 86400000;

/** Labels for the time axis: month starts, thinned to at most `max`. */
function timeTicks(fromIso, toIso, max = 4) {
  const span = dayNum(toIso) - dayNum(fromIso);
  if (span < 50) return [fromIso, toIso].filter((v, i, a) => a.indexOf(v) === i).map((iso) => ({ iso, text: shortDate(iso) }));
  if (span > 540) {
    // Long ranges: one label per year, at 1 January.
    const years = [];
    for (let y = Number(fromIso.slice(0, 4)) + 1; y <= Number(toIso.slice(0, 4)); y++) years.push(y);
    const step = Math.ceil(years.length / max);
    return years.filter((_, i) => i % step === 0).map((y) => ({ iso: `${y}-01-01`, text: String(y) }));
  }
  const out = [];
  const d = parseISODate(fromIso);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  while (d <= parseISODate(toIso)) {
    out.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  const step = Math.ceil(out.length / max);
  const years = new Set(out.map((x) => x.getFullYear())).size > 1;
  return out.filter((_, i) => i % step === 0).map((x) => ({
    iso: `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-01`,
    text: years && x.getMonth() === 0 ? String(x.getFullYear()) : MONTHS[x.getMonth()],
  }));
}

function shortDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** Draws again at the box's width whenever it changes. */
function responsive(box, draw) {
  let last = 0;
  const run = () => {
    const w = Math.round(box.clientWidth);
    if (w > 0 && w !== last) { last = w; draw(w); }
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(run).observe(box);
  requestAnimationFrame(run);
  return () => { last = 0; run(); };
}

/** Lets a tap or drag pick the nearest item by x position. */
function onPick(svg, xs, pick) {
  const choose = (e) => {
    const r = svg.getBoundingClientRect();
    const x = e.clientX - r.left;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
    pick(best);
  };
  // preventDefault stops a tap from drawing the keyboard focus ring.
  svg.addEventListener('pointerdown', (e) => { e.preventDefault(); choose(e); svg.setPointerCapture?.(e.pointerId); });
  svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') choose(e); });
}

/** Arrow keys move the selection, for keyboard users. */
function onKeys(svg, count, getIndex, pick) {
  svg.setAttribute('tabindex', '0');
  svg.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    pick(Math.max(0, Math.min(count - 1, getIndex() + d)));
  });
}

/**
 * Line chart of values over time.
 * points: [{ date: 'YYYY-MM-DD', value, text }] oldest first. `text` is the readout for that point.
 */
export function lineChart({ points, unit, label }) {
  const readout = h('p', { class: 'chart-readout', 'aria-live': 'polite' });
  const box = h('div', { class: 'chart-box' });
  let selected = points.length - 1;

  const draw = (width) => {
    const iw = width - PAD.left - PAD.right;
    const ih = HEIGHT - PAD.top - PAD.bottom;
    const vals = points.map((p) => p.value);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    // Start the axis near the lowest value so changes are visible, but leave room under it.
    const ticks = niceTicks(Math.max(0, lo - (hi - lo) * 0.25 - (hi === lo ? hi * 0.2 : 0)), hi + (hi === lo ? hi * 0.1 : 0));
    const y0 = ticks[0];
    const y1 = ticks.at(-1);
    const y = (v) => PAD.top + ih - ((v - y0) / (y1 - y0 || 1)) * ih;

    const first = points[0].date;
    const lastDate = points.at(-1).date;
    const span = dayNum(lastDate) - dayNum(first);
    const x = (iso) => (span === 0 ? PAD.left + iw / 2 : PAD.left + ((dayNum(iso) - dayNum(first)) / span) * iw);
    const xs = points.map((p) => x(p.date));

    const grid = ticks.map((t) => s('g', {},
      s('line', { class: 'grid', x1: PAD.left, x2: width - PAD.right, y1: y(t), y2: y(t) }),
      s('text', { class: 'tick', x: PAD.left - 6, y: y(t) + 4, 'text-anchor': 'end' }, fmt(t))));
    const xLabels = (span === 0 ? [{ iso: first, text: shortDate(first) }] : timeTicks(first, lastDate))
      .map((t, i, all) => {
        const tx = Math.max(PAD.left, Math.min(width - PAD.right, x(t.iso)));
        const anchor = span < 50 && all.length > 1 ? (i === 0 ? 'start' : 'end') : 'middle';
        return s('text', { class: 'tick', x: tx, y: HEIGHT - 6, 'text-anchor': anchor }, t.text);
      });

    const path = points.map((p, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const cross = s('line', { class: 'crosshair', y1: PAD.top, y2: PAD.top + ih });
    const dots = points.map((p, i) => s('circle', { class: 'dot', cx: xs[i], cy: y(p.value), r: 4.5 }));
    const svg = s('svg', {
      class: 'chart', width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`,
      role: 'img', 'aria-label': `${label}: ${points.length} workouts. Use the left and right arrow keys to read each one.`,
    },
    grid, xLabels,
    s('line', { class: 'axis', x1: PAD.left, x2: width - PAD.right, y1: PAD.top + ih, y2: PAD.top + ih }),
    cross,
    points.length > 1 ? s('path', { class: 'line', d: path }) : null,
    dots);

    const pick = (i) => {
      selected = i;
      cross.setAttribute('x1', xs[i]);
      cross.setAttribute('x2', xs[i]);
      dots.forEach((d, j) => { d.classList.toggle('selected', j === i); d.setAttribute('r', j === i ? 7 : 4.5); });
      readout.replaceChildren(h('strong', {}, `${fmt(points[i].value)} ${unit}`), h('span', { class: 'muted' }, ` · ${points[i].text}`));
    };
    onPick(svg, xs, pick);
    onKeys(svg, points.length, () => selected, pick);
    box.replaceChildren(svg);
    pick(selected);
  };
  responsive(box, draw);
  return h('div', { class: 'chart-wrap' }, readout, box);
}

/**
 * Bar chart of counts.
 * bars: [{ key, value, label, text }] oldest first. `label` goes under the bar
 * (may be empty), `text` is the readout for that bar.
 */
export function barChart({ bars, unit, label, summary }) {
  const readout = h('p', { class: 'chart-readout', 'aria-live': 'polite' });
  const box = h('div', { class: 'chart-box' });
  let selected = -1;

  const showSummary = () => readout.replaceChildren(summary);

  const draw = (width) => {
    const left = 28;
    const iw = width - left - PAD.right;
    const ih = HEIGHT - PAD.top - PAD.bottom;
    const top = Math.max(3, ...bars.map((b) => b.value));
    const ticks = niceTicks(0, top, 3).filter((t) => Number.isInteger(t));
    const yMax = ticks.at(-1);
    const y = (v) => PAD.top + ih - (v / yMax) * ih;
    const slot = iw / bars.length;
    const gap = Math.min(6, Math.max(2, slot * 0.25));
    const bw = slot - gap;
    const xs = bars.map((_, i) => left + slot * i + slot / 2);
    const base = PAD.top + ih;

    const grid = ticks.map((t) => s('g', {},
      s('line', { class: 'grid', x1: left, x2: width - PAD.right, y1: y(t), y2: y(t) }),
      s('text', { class: 'tick', x: left - 6, y: y(t) + 4, 'text-anchor': 'end' }, fmt(t))));
    const rects = bars.map((b, i) => {
      if (!b.value) return s('rect', { class: 'bar empty', x: xs[i] - bw / 2, y: base - 2, width: bw, height: 2 });
      const top = y(b.value);
      const r = Math.min(4, bw / 2, base - top);
      const x0 = xs[i] - bw / 2;
      const d = `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${base} Z`;
      return s('path', { class: 'bar', d });
    });
    const labels = bars.map((b, i) => (b.label ? s('text', { class: 'tick', x: xs[i], y: HEIGHT - 6, 'text-anchor': 'middle' }, b.label) : null));
    const svg = s('svg', {
      class: 'chart', width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`,
      role: 'img', 'aria-label': `${label}. Use the left and right arrow keys to read each bar.`,
    }, grid, s('line', { class: 'axis', x1: left, x2: width - PAD.right, y1: base, y2: base }), rects, labels);

    const pick = (i) => {
      selected = i;
      rects.forEach((r, j) => r.classList.toggle('selected', j === i));
      const b = bars[i];
      readout.replaceChildren(h('strong', {}, `${b.value} ${b.value === 1 ? unit.one : unit.many}`), h('span', { class: 'muted' }, ` · ${b.text}`));
    };
    onPick(svg, xs, pick);
    onKeys(svg, bars.length, () => (selected < 0 ? bars.length : selected), pick);
    box.replaceChildren(svg);
    if (selected >= 0 && selected < bars.length) pick(selected); else showSummary();
  };
  responsive(box, draw);
  return h('div', { class: 'chart-wrap' }, readout, box);
}
