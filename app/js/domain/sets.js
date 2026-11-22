// Rules for the sets inside one exercise: planning today's sets from last
// time, the warm-up scheme, rest times and short summaries.
//
// A set is { kind: 'warmup' | 'work', weight, reps, seconds, done }.

import { Measure, SetKind, formatSeconds } from './model.js';

/**
 * Warm-up before the first exercise of the day, as a share of the working
 * weight. Each step names the rest setting used after it. Change or extend
 * this list to change the warm-up.
 */
export const WARMUP_SCHEME = Object.freeze([
  { pct: 0.5, reps: 12, rest: 'warmup1' },
  { pct: 0.5, reps: 10, rest: 'warmup2' },
  { pct: 0.7, reps: 7, rest: 'warmup3' },
]);

/** Default rest times in seconds. The user can change them in Settings. */
export const DEFAULT_REST = Object.freeze({ warmup1: 60, warmup2: 60, warmup3: 180, work: 180, circuit: 60 });

export const DEFAULT_WORK_SETS = 3;
export const DEFAULT_REPS = 8;
export const DEFAULT_SECONDS = 60;
export const WEIGHT_ROUNDING = 5; // lb

export const workSets = (sets) => (sets ?? []).filter((s) => s.kind === SetKind.WORK);
export const doneWorkSets = (sets) => workSets(sets).filter((s) => s.done);

export function roundWeight(w, step = WEIGHT_ROUNDING) {
  return Math.max(0, Math.round(w / step) * step);
}

/** The working weight used last time: the heaviest completed work set. */
export function workingWeight(sets) {
  const ws = doneWorkSets(sets).map((s) => s.weight).filter((w) => typeof w === 'number');
  return ws.length ? Math.max(...ws) : null;
}

export function warmupSets(weight) {
  return WARMUP_SCHEME.map((w) => ({ kind: SetKind.WARMUP, weight: roundWeight(weight * w.pct), reps: w.reps, seconds: null, done: false }));
}

/**
 * Today's sets for one exercise, based on last time's sets (or null).
 * Same number of work sets and the same reps as last time.
 * `warmup` adds the warm-up sets (weight exercises with a weight only).
 */
export function planSets(measure, lastSets, { warmup = false } = {}) {
  const prev = doneWorkSets(lastSets);
  const count = prev.length || DEFAULT_WORK_SETS;
  const weight = measure === Measure.WEIGHT ? (workingWeight(lastSets) ?? 0) : null;
  const work = Array.from({ length: count }, (_, i) => {
    const p = prev[i] ?? prev[prev.length - 1];
    return {
      kind: SetKind.WORK,
      weight,
      reps: measure === Measure.TIME ? null : (p?.reps ?? DEFAULT_REPS),
      seconds: measure === Measure.TIME ? (p?.seconds ?? DEFAULT_SECONDS) : null,
      done: false,
    };
  });
  const warm = warmup && measure === Measure.WEIGHT && weight > 0 ? warmupSets(weight) : [];
  return [...warm, ...work];
}

/** Set a new working weight: updates work sets and re-computes warm-ups. */
export function withWorkingWeight(sets, weight) {
  const warm = sets.filter((s) => s.kind === SetKind.WARMUP);
  const fresh = warmupSets(weight);
  let wi = 0;
  return sets.map((s) => {
    if (s.kind === SetKind.WORK) return s.done ? s : { ...s, weight };
    const f = fresh[wi++];
    return s.done || !f || warm.length !== fresh.length ? s : { ...s, weight: f.weight };
  });
}

/** Add one work set (copy of the last work set) or remove the last undone work set. */
export function addWorkSet(sets) {
  const last = workSets(sets).at(-1) ?? { kind: SetKind.WORK, weight: null, reps: DEFAULT_REPS, seconds: null };
  return [...sets, { ...last, done: false }];
}
export function removeWorkSet(sets) {
  for (let i = sets.length - 1; i >= 0; i--) {
    if (sets[i].kind === SetKind.WORK && !sets[i].done) return [...sets.slice(0, i), ...sets.slice(i + 1)];
  }
  return sets;
}

/** Rest in seconds after set `index`, or 0 after the last set. */
export function restAfter(sets, index, rest = DEFAULT_REST) {
  if (index >= sets.length - 1) return 0;
  const s = sets[index];
  if (s.kind === SetKind.WARMUP) {
    const n = sets.slice(0, index + 1).filter((x) => x.kind === SetKind.WARMUP).length;
    return rest[WARMUP_SCHEME[n - 1]?.rest] ?? rest.work;
  }
  return rest.work;
}

/** "180 lb · 8, 8, 7 reps", "1 min × 3", "12, 12, 12 reps". Completed work sets only. */
export function summarize(measure, sets) {
  const done = doneWorkSets(sets);
  if (!done.length) return '';
  if (measure === Measure.TIME) {
    const secs = [...new Set(done.map((s) => s.seconds))];
    return secs.length === 1 && secs[0] != null ? `${formatSeconds(secs[0])} × ${done.length}` : `${done.length} sets`;
  }
  const reps = done.map((s) => s.reps);
  const repText = reps.every((r) => r == null) ? `${done.length} sets` : `${reps.map((r) => r ?? '–').join(', ')} reps`;
  if (measure === Measure.WEIGHT) {
    const w = workingWeight(sets);
    if (w) return `${w} lb · ${repText}`;
  }
  return repText;
}
