// Numbers for the progress charts, calculated from history.
// Pure functions: no storage or screen code.

import { Measure } from './model.js';
import { doneWorkSets } from './sets.js';
import { parseISODate, toISODate } from './dates.js';
import { historyFor } from './history.js';

/**
 * Estimated 1-rep max (Epley formula): weight × (1 + reps / 30).
 * One rep is the weight itself. Above 12 reps the estimate is poor, so reps are capped at 12.
 */
export function estimatedMax(weight, reps) {
  if (!(weight > 0) || !(reps > 0)) return null;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + Math.min(reps, 12) / 30));
}

/**
 * The chart measures that make sense for each kind of exercise.
 * The first one is the default.
 * `value(sets)` returns a number, or null when the sets do not hold it.
 */
export const METRICS = Object.freeze({
  weight: {
    label: 'Weight', unit: 'lb',
    help: 'Heaviest work set each workout.',
    value: (sets) => max(doneWorkSets(sets).map((s) => s.weight)),
  },
  max: {
    label: 'Est. 1-rep max', unit: 'lb',
    help: 'The most you could lift once, estimated from weight and reps. Lets a heavy set of 5 and a lighter set of 10 be compared.',
    value: (sets) => max(doneWorkSets(sets).map((s) => estimatedMax(s.weight, s.reps))),
  },
  volume: {
    label: 'Volume', unit: 'lb',
    help: 'Weight × reps, added up over all work sets.',
    value: (sets) => {
      const v = doneWorkSets(sets).reduce((t, s) => t + (s.weight > 0 && s.reps > 0 ? s.weight * s.reps : 0), 0);
      return v > 0 ? v : null;
    },
  },
  reps: {
    label: 'Reps', unit: 'reps',
    help: 'Most reps in one set each workout.',
    value: (sets) => max(doneWorkSets(sets).map((s) => s.reps)),
  },
  totalReps: {
    label: 'Total reps', unit: 'reps',
    help: 'Reps added up over all work sets.',
    value: (sets) => {
      const v = doneWorkSets(sets).reduce((t, s) => t + (s.reps > 0 ? s.reps : 0), 0);
      return v > 0 ? v : null;
    },
  },
  seconds: {
    label: 'Time', unit: 'sec',
    help: 'Longest set each workout.',
    value: (sets) => max(doneWorkSets(sets).map((s) => s.seconds)),
  },
});

export function metricsFor(measure) {
  switch (measure) {
    case Measure.TIME: return ['seconds'];
    case Measure.REPS: return ['reps', 'totalReps'];
    default: return ['weight', 'max', 'volume'];
  }
}

function max(values) {
  const ok = values.filter((v) => typeof v === 'number' && v > 0);
  return ok.length ? Math.max(...ok) : null;
}

/**
 * One point per workout date, oldest first: [{ date, value, log }].
 * Workouts without the number (for example a circuit logged with sets only) are left out.
 * If one date has two entries, the higher value is kept.
 */
export function progressSeries(logs, personId, exerciseId, metricKey) {
  const metric = METRICS[metricKey];
  if (!metric) return [];
  const byDate = new Map();
  for (const log of historyFor(logs, personId, exerciseId)) {
    const value = metric.value(log.sets);
    if (value == null) continue;
    const prev = byDate.get(log.date);
    if (!prev || value > prev.value) byDate.set(log.date, { date: log.date, value, log });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** The Monday on or before a date, as "YYYY-MM-DD". */
export function weekStart(iso) {
  const d = parseISODate(iso);
  const back = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - back);
  return toISODate(d);
}

/** Distinct dates on which a person finished at least one set. */
export function workoutDates(logs, personId) {
  const out = new Set();
  for (const l of logs) {
    if (l.personId === personId && (l.sets ?? []).some((s) => s.done)) out.add(l.date);
  }
  return out;
}

/**
 * Workout days per week for the `count` weeks ending with the week of `todayIso`,
 * oldest first: [{ start, end, days }]. A week runs Monday to Sunday.
 */
export function weeklyActivity(logs, personId, todayIso, count = 12) {
  const dates = workoutDates(logs, personId);
  const first = parseISODate(weekStart(todayIso));
  first.setDate(first.getDate() - 7 * (count - 1));
  const weeks = [];
  for (let i = 0; i < count; i++) {
    const s = new Date(first);
    s.setDate(first.getDate() + 7 * i);
    const e = new Date(s);
    e.setDate(s.getDate() + 6);
    weeks.push({ start: toISODate(s), end: toISODate(e), days: 0 });
  }
  for (const d of dates) {
    const w = weeks.find((x) => d >= x.start && d <= x.end);
    if (w) w.days += 1;
  }
  return weeks;
}

/** Workout days per calendar month for the `count` months ending with the month of `todayIso`. */
export function monthlyActivity(logs, personId, todayIso, count = 12) {
  const dates = workoutDates(logs, personId);
  const [y, m] = todayIso.split('-').map(Number);
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const key = toISODate(d).slice(0, 7);
    months.push({ start: `${key}-01`, end: toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)), days: 0 });
  }
  for (const d of dates) {
    const mo = months.find((x) => d >= x.start && d <= x.end);
    if (mo) mo.days += 1;
  }
  return months;
}
