// History: every exercise, and every past workout for one exercise.

import { h } from './dom.js';
import { howToLink, topBar, emptyState } from './components.js';
import { summarize } from '../domain/sets.js';
import { SetKind } from '../domain/model.js';
import { formatDate, formatAgo } from '../domain/dates.js';
import { historyFor, lastDates } from '../domain/history.js';

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
  return [topBar('History'), search, list];
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
    entries.length ? h('ul', { class: 'list' }, rows) : emptyState('No workouts logged yet.'),
  ];
}
