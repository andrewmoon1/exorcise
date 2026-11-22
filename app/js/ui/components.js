// Small reusable pieces shared by the screens.

import { h, safeUrl } from './dom.js';
import { FieldInfo } from '../domain/model.js';
import { summarize } from '../domain/sets.js';
import { formatAgo, formatDate } from '../domain/dates.js';

/**
 * A number with − and + buttons. Calls onChange(value) after a tap, or when
 * a typed value is confirmed (blur or Enter).
 */
export function stepper(field, value, onChange, { compact = false, ariaLabel } = {}) {
  const info = FieldInfo[field];
  const text = ariaLabel ?? info.label;
  const input = h('input', {
    class: 'stepper-input',
    type: 'number',
    inputmode: info.decimals ? 'decimal' : 'numeric',
    min: info.min,
    step: 'any',
    value: value ?? '',
    'aria-label': text,
    onfocus: (e) => e.target.select(),
    onchange: (e) => onChange(e.target.value === '' ? null : Number(e.target.value)),
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
  });
  const bump = (dir) => () => {
    const cur = Number(input.value) || 0;
    const next = Math.max(info.min, Math.round((cur + dir * info.step) * 100) / 100);
    input.value = next;
    onChange(next);
  };
  return h('div', { class: `stepper field-${field}${compact ? ' compact' : ''}` },
    h('button', { class: 'step', type: 'button', 'aria-label': `less ${text}`, onclick: bump(-1) }, '−'),
    h('label', { class: 'stepper-field' }, input, compact ? null : h('span', { class: 'stepper-label' }, info.label)),
    h('button', { class: 'step', type: 'button', 'aria-label': `more ${text}`, onclick: bump(1) }, '+'),
  );
}

/** "Last time 180 lb · 12, 12, 12 reps · 21 Jul (4 months ago)" */
export function lastLine(exercise, last, today, filledFrom) {
  if (!last) return h('p', { class: 'last muted' }, filledFrom ? `First time · numbers from ${filledFrom}` : 'First time');
  return h('p', { class: 'last' },
    h('span', { class: 'last-label' }, 'Last time '),
    h('strong', {}, summarize(exercise.measure, last.sets) || 'done'),
    h('span', { class: 'muted' }, ` · ${formatDate(last.date, today)} (${formatAgo(last.date, today)})`),
    last.note ? h('span', { class: 'muted' }, ` · ${last.note}`) : null,
  );
}

export function howToLink(exercise) {
  const url = safeUrl(exercise.link);
  if (!url) return null;
  return h('a', { class: 'howto', href: url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `How to do ${exercise.name}` }, 'How to');
}

export function topBar(title, { back, right } = {}) {
  return h('header', { class: 'topbar' },
    back ? h('a', { class: 'back', href: back, 'aria-label': 'Back' }, '‹') : null,
    h('h1', {}, title),
    right ?? null,
  );
}

export function emptyState(text) {
  return h('p', { class: 'empty muted' }, text);
}
