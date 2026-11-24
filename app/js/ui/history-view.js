// History: how often you train, every exercise, and every past workout
// for one exercise with a progress chart.

import { h } from './dom.js';
import { howToLink, topBar, emptyState } from './components.js';
import { lineChart, barChart, createSync } from './charts.js';
import { summarize } from '../domain/sets.js';
import { SetKind } from '../domain/model.js';
import { formatDate, formatAgo } from '../domain/dates.js';
import { historyFor, lastDates } from '../domain/history.js';
import { METRICS, metricsFor, overviewFor, progressSeries, weeklyActivity, monthlyActivity } from '../domain/progress.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_UNIT = { one: 'workout day', many: 'workout days' };

function choiceRow(options, current, onPick) {
  return h('div', { class: 'choices small', role: 'group' }, options.map(([key, text]) => h('button', {
    class: `choice${key === current ? ' selected' : ''}`, type: 'button', 'aria-pressed': String(key === current),
    onclick: () => onPick(key),
  }, text)));
}

/** Bar chart of workout days per week (last 12 weeks) or per month (last 12 months). */
function activityCard(app, ui) {
  const today = app.today();
  const personId = app.activePerson.id;
  const weeks = weeklyActivity(app.logs, personId, today, 12);
  const months = monthlyActivity(app.logs, personId, today, 12);
  // Open on the weeks view, unless there is nothing in it yet.
  const range = ui.activityRange ?? (weeks.some((w) => w.days) ? 'weeks' : 'months');
  const rows = range === 'weeks' ? weeks : months;
  const total = rows.reduce((t, r) => t + r.days, 0);

  let prevMonth = null;
  const bars = rows.map((r, i) => {
    const m = Number(r.start.slice(5, 7)) - 1;
    let label = '';
    if (range === 'weeks') {
      // Name the month under its first week.
      const endMonth = Number(r.end.slice(5, 7)) - 1;
      if (i === 0 || endMonth !== prevMonth) label = MONTH_NAMES[endMonth].slice(0, 3);
      prevMonth = endMonth;
    } else if (i % 2 === (rows.length - 1) % 2) {
      label = MONTH_NAMES[m].slice(0, 3);
    }
    const text = range === 'weeks' ? `week of ${formatDate(r.start, today)}` : `${MONTH_NAMES[m]} ${r.start.slice(0, 4)}`;
    return { key: r.start, value: r.days, label, text };
  });

  const span = range === 'weeks' ? 'the last 12 weeks' : 'the last 12 months';
  const summary = h('span', {}, h('strong', {}, `${total} workout day${total === 1 ? '' : 's'}`), h('span', { class: 'muted' }, ` in ${span}`));
  return h('section', { class: 'card' },
    h('h2', {}, 'How often you train'),
    choiceRow([['weeks', 'Weeks'], ['months', 'Months']], range, (k) => { ui.activityRange = k; ui.rerender(); }),
    barChart({ bars, unit: DAYS_UNIT, label: `Workout days per ${range === 'weeks' ? 'week' : 'month'}`, summary }),
    h('p', { class: 'chart-note muted' }, 'Tap a bar to see that ' + (range === 'weeks' ? 'week.' : 'month.')));
}

/** Line chart of one exercise over time, with a choice of measure. */
function progressCard(app, ui, ex) {
  const today = app.today();
  const keys = metricsFor(ex.measure);
  ui.chartMetric ??= {};
  const metricKey = keys.includes(ui.chartMetric[ex.measure]) ? ui.chartMetric[ex.measure] : keys[0];
  const parts = overviewFor(ex.measure);
  const labelOf = (k) => (k === 'overview' ? parts.map((p, i) => (i ? METRICS[p].label.toLowerCase() : METRICS[p].label)).join(', ') : METRICS[k].label);
  const picker = keys.length > 1
    ? choiceRow(keys.map((k) => [k, labelOf(k)]), metricKey, (k) => { ui.chartMetric[ex.measure] = k; ui.rerender(); })
    : null;
  if (metricKey === 'overview') return overviewCard(app, ex, parts, picker);

  const metric = METRICS[metricKey];
  const series = progressSeries(app.logs, app.activePerson.id, ex.id, metricKey);

  if (!series.length) {
    return h('section', { class: 'card' }, h('h2', {}, 'Progress'), picker,
      h('p', { class: 'muted chart-note' }, `No ${metric.label.toLowerCase()} logged yet. The chart appears after a workout with ${metric.unit === 'lb' ? 'a weight' : metric.unit}.`));
  }

  const points = series.map((p) => {
    let sets = summarize(ex.measure, p.log.sets) || 'done';
    // The weight is already the chart value, so only add the reps.
    if (metricKey === 'weight') sets = sets.split(' · ').at(-1);
    return {
      date: p.date,
      value: p.value,
      text: `${formatDate(p.date, today)} · ${sets}${p.log.source === 'spreadsheet' ? ' · from spreadsheet' : ''}`,
    };
  });
  const first = series[0];
  const last = series.at(-1);
  const diff = Math.round((last.value - first.value) * 10) / 10;
  const change = series.length > 1
    ? h('p', { class: 'chart-change' },
      h('strong', {}, diff === 0 ? 'No change' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} ${metric.unit}`),
      h('span', { class: 'muted' }, ` since ${formatDate(first.date, today)}`))
    : null;

  return h('section', { class: 'card' },
    h('h2', {}, 'Progress'),
    picker,
    change,
    lineChart({ points, unit: metric.unit, label: `${ex.name} ${metric.label.toLowerCase()} over time` }),
    h('p', { class: 'chart-note muted' }, metric.help,
      series.length === 1 ? ' One workout so far, so the line starts after the next one.' : ' Tap the chart to read a workout.'));
}

/**
 * Weight, reps and sets (or the measures that fit the exercise) as small line
 * charts on one shared time line. Tapping any chart selects that workout in all.
 */
function overviewCard(app, ex, parts, picker) {
  const today = app.today();
  const charts = parts
    .map((k) => ({ key: k, metric: METRICS[k], series: progressSeries(app.logs, app.activePerson.id, ex.id, k) }))
    .filter((c) => c.series.length);
  const head = [h('h2', {}, 'Progress'), picker];
  if (!charts.length) return h('section', { class: 'card' }, head, h('p', { class: 'muted chart-note' }, 'Nothing to chart yet.'));

  const byDate = new Map();
  for (const c of charts) for (const p of c.series) if (!byDate.has(p.date)) byDate.set(p.date, p.log);
  const dates = [...byDate.keys()].sort();
  const readout = h('p', { class: 'chart-readout', 'aria-live': 'polite' });
  const showReadout = (date) => {
    const log = byDate.get(date);
    readout.replaceChildren(
      h('strong', {}, formatDate(date, today)),
      h('span', { class: 'muted' }, ` · ${summarize(ex.measure, log.sets) || 'done'}${log.source === 'spreadsheet' ? ' · from spreadsheet' : ''}`));
  };
  const sync = createSync(dates.at(-1), showReadout);
  showReadout(dates.at(-1));

  return h('section', { class: 'card' }, head, readout,
    charts.map((c) => lineChart({
      points: c.series.map((p) => ({ date: p.date, value: p.value, text: '' })),
      unit: c.metric.unit,
      label: `${ex.name} ${c.metric.label.toLowerCase()} over time`,
      title: c.metric.unit === c.metric.label.toLowerCase() ? c.metric.label : `${c.metric.label} (${c.metric.unit})`,
      height: 130, from: dates[0], to: dates.at(-1), sync, readout: false, whole: c.metric.unit !== 'lb',
    })),
    h('p', { class: 'chart-note muted' }, parts.map((k) => `${METRICS[k].label}: ${METRICS[k].help[0].toLowerCase()}${METRICS[k].help.slice(1)}`).join(' '),
      dates.length === 1 ? ' One workout so far, so the lines start after the next one.' : ' Tap a chart to read a workout.'));
}

export function renderHistoryList(app, ui) {
  const today = app.today();
  const dates = lastDates(app.logs, app.activePerson.id);
  const items = [...app.exercises].sort((a, b) => a.name.localeCompare(b.name));
  const list = h('ul', { class: 'list' });
  const fill = (q) => {
    list.replaceChildren(...items
      .filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
      .map((e) => {
        const d = dates.get(e.id);
        return h('li', {}, h('a', { class: 'list-row', href: `#/history/${e.id}` },
          h('span', {}, e.name),
          h('span', { class: 'muted' }, d ? formatAgo(d, today) : 'never')));
      }));
  };
  const search = h('input', {
    class: 'search', type: 'search', placeholder: 'Find an exercise', 'aria-label': 'Find an exercise',
    value: ui.historyQuery ?? '',
    oninput: (e) => { ui.historyQuery = e.target.value; fill(e.target.value); },
  });
  fill(ui.historyQuery ?? '');
  return [topBar('History'), activityCard(app, ui), h('h2', { class: 'section-title' }, 'Exercises'), search, list];
}

export function renderHistoryDetail(app, ui, exerciseId) {
  const ex = app.exercise(exerciseId);
  if (!ex) return [topBar('History', { back: '#/history' }), emptyState('Exercise not found.')];
  const today = app.today();
  const entries = historyFor(app.logs, app.activePerson.id, ex.id);

  const rows = entries.map((l) => h('li', { class: 'list-row' },
    h('span', {},
      h('strong', {}, summarize(ex.measure, l.sets) || 'done'),
      l.sets.some((x) => x.kind === SetKind.WARMUP && x.done) ? h('span', { class: 'muted' }, ' · with warm-up') : null,
      l.note ? h('span', { class: 'muted' }, ` · ${l.note}`) : null),
    h('span', { class: 'row-end' },
      h('span', { class: 'muted' }, formatDate(l.date, today)),
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': `Delete entry from ${formatDate(l.date, today)}`,
        onclick: async () => { if (confirm('Delete this entry?')) await app.deleteLog(l.id); },
      }, '✕'))));

  return [
    topBar(ex.name, { back: '#/history', right: h('a', { class: 'btn-text', href: `#/exercise/${ex.id}` }, 'Edit') }),
    h('p', { class: 'subtitle muted' }, `${entries.length} workout${entries.length === 1 ? '' : 's'} `, howToLink(ex)),
    entries.length ? progressCard(app, ui, ex) : null,
    entries.length ? h('ul', { class: 'list' }, rows) : emptyState('No workouts logged yet.'),
  ];
}
