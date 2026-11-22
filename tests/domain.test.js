import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextExerciseId, exercisesForWorkout } from '../app/js/domain/rotation.js';
import { lastPerformance, historyFor } from '../app/js/domain/history.js';
import { cleanNumber, formatClock, Measure, SlotKind } from '../app/js/domain/model.js';
import { planSets, withWorkingWeight, restAfter, summarize, addWorkSet, removeWorkSet, DEFAULT_REST } from '../app/js/domain/sets.js';
import { isoWeekday, formatAgo, formatDate } from '../app/js/domain/dates.js';
import { kindAfterChange, moveItem } from '../app/js/domain/plan.js';

const slot = { id: 's1', kind: SlotKind.ROTATE, exerciseIds: ['dl', 'rdl', 'sldl'] };
const W = (weight, reps, done = true) => ({ kind: 'work', weight, reps, seconds: null, done });
const L = (date, exerciseId, extra = {}) => ({
  id: date + exerciseId, personId: 'a', slotId: 's1', date, exerciseId,
  sets: [W(extra.weight ?? 100, 8)], ...extra,
});

test('rotation starts with the first variation when there is no history', () => {
  assert.equal(nextExerciseId(slot, [], 'a'), 'dl');
});

test('rotation moves to the variation after the last one done, and wraps', () => {
  assert.equal(nextExerciseId(slot, [L('2026-01-01', 'dl')], 'a'), 'rdl');
  assert.equal(nextExerciseId(slot, [L('2026-01-01', 'dl'), L('2026-01-08', 'rdl')], 'a'), 'sldl');
  assert.equal(nextExerciseId(slot, [L('2026-01-08', 'sldl'), L('2026-01-01', 'dl')], 'a'), 'dl');
});

test('rotation follows what was actually done after a swap', () => {
  // Plan said rdl, user swapped to sldl -> next is dl.
  assert.equal(nextExerciseId(slot, [L('2026-01-01', 'dl'), L('2026-01-08', 'sldl')], 'a'), 'dl');
});

test('rotation ignores today, other people and other slots', () => {
  const logs = [
    L('2026-01-01', 'dl'),
    L('2026-01-08', 'rdl'),               // today
    { ...L('2026-01-05', 'sldl'), personId: 'b' },
    { ...L('2026-01-06', 'sldl'), slotId: 'other' },
  ];
  assert.equal(nextExerciseId(slot, logs, 'a', '2026-01-08'), 'rdl');
});

test('single slots do not rotate; circuits ask for every exercise', () => {
  const single = { id: 's', kind: SlotKind.SINGLE, exerciseIds: ['x'] };
  assert.equal(nextExerciseId(single, [], 'a'), 'x');
  const circuit = { id: 'c', kind: SlotKind.CIRCUIT, exerciseIds: ['p', 'q'] };
  assert.deepEqual(exercisesForWorkout(circuit), ['p', 'q']);
  assert.deepEqual(exercisesForWorkout(slot, 'rdl'), ['rdl']);
});

test('last performance is the newest entry before the given date', () => {
  const logs = [
    L('2026-01-01', 'dl', { weight: 100 }),
    L('2026-02-01', 'dl', { weight: 120 }),
    L('2026-03-01', 'dl', { weight: 140 }),
    L('2026-02-15', 'rdl', { weight: 90 }),
  ];
  assert.equal(lastPerformance(logs, 'a', 'dl').weight, 140);
  assert.equal(lastPerformance(logs, 'a', 'dl', '2026-03-01').weight, 120);
  assert.equal(lastPerformance(logs, 'a', 'nope'), null);
  assert.deepEqual(historyFor(logs, 'a', 'dl').map((l) => l.weight), [140, 120, 100]);
});

test('planSets copies last time: same working weight, set count and reps', () => {
  const sets = planSets(Measure.WEIGHT, [W(180, 8), W(180, 7), W(180, 6), W(185, 4, false)]);
  assert.equal(sets.length, 3);
  assert.deepEqual(sets.map((s) => [s.kind, s.weight, s.reps, s.done]), [['work', 180, 8, false], ['work', 180, 7, false], ['work', 180, 6, false]]);
});

test('planSets adds the warm-up: 12 @ 50%, 10 @ 50%, 7 @ 70%, rounded to 5 lb', () => {
  const sets = planSets(Measure.WEIGHT, [W(180, 8), W(180, 8), W(180, 8)], { warmup: true });
  assert.deepEqual(sets.slice(0, 3).map((s) => [s.kind, s.weight, s.reps]), [['warmup', 90, 12], ['warmup', 90, 10], ['warmup', 125, 7]]);
  assert.equal(sets.length, 6);
  // No warm-up for a time exercise or without a weight.
  assert.equal(planSets(Measure.TIME, null, { warmup: true }).length, 3);
  assert.equal(planSets(Measure.WEIGHT, null, { warmup: true }).length, 3);
});

test('six sets last time gives six sets today (calves)', () => {
  assert.equal(planSets(Measure.WEIGHT, Array.from({ length: 6 }, () => W(120, 12))).length, 6);
});

test('changing working weight updates work sets and warm-ups not done yet', () => {
  const sets = planSets(Measure.WEIGHT, [W(100, 8)], { warmup: true });
  sets[0].done = true;
  const next = withWorkingWeight(sets, 200);
  assert.equal(next[0].weight, 50); // done: unchanged
  assert.equal(next[1].weight, 100);
  assert.equal(next[2].weight, 140);
  assert.equal(next[3].weight, 200);
});

test('rest after each set follows the settings', () => {
  const sets = planSets(Measure.WEIGHT, [W(100, 8), W(100, 8), W(100, 8)], { warmup: true });
  const rest = { ...DEFAULT_REST, warmup1: 45 };
  assert.deepEqual(sets.map((_, i) => restAfter(sets, i, rest)), [45, 60, 180, 180, 180, 0]);
});

test('add and remove work sets', () => {
  const sets = [W(100, 8, true), W(100, 8, false)];
  assert.equal(addWorkSet(sets).length, 3);
  assert.equal(removeWorkSet(sets).length, 1);
  assert.equal(removeWorkSet([W(100, 8, true)]).length, 1); // never removes a done set
});

test('summary text', () => {
  assert.equal(summarize(Measure.WEIGHT, [{ kind: 'warmup', weight: 90, reps: 12, done: true }, W(180, 8), W(180, 7)]), '180 lb · 8, 7 reps');
  assert.equal(summarize(Measure.TIME, [{ kind: 'work', seconds: 60, done: true }, { kind: 'work', seconds: 60, done: true }]), '1 min × 2');
  assert.equal(summarize(Measure.WEIGHT, [W(null, null), W(null, null)]), '2 sets');
  assert.equal(summarize(Measure.WEIGHT, [W(100, 8, false)]), '');
});

test('number cleaning and clock', () => {
  assert.equal(cleanNumber('weight', '27.5'), 27.5);
  assert.equal(cleanNumber('reps', ''), null);
  assert.throws(() => cleanNumber('reps', -1));
  assert.equal(formatClock(65), '1:05');
});

test('dates', () => {
  assert.equal(isoWeekday('2026-11-23'), 1); // Monday
  assert.equal(isoWeekday('2026-11-22'), 7); // Sunday
  assert.equal(formatAgo('2026-11-21', '2026-11-22'), 'yesterday');
  assert.equal(formatAgo('2026-07-21', '2026-11-22'), '4 months ago');
  assert.equal(formatDate('2026-07-21', '2026-11-22'), '21 Jul');
  assert.equal(formatDate('2025-11-07', '2026-11-22'), '7 Nov 2025');
});

test('plan helpers', () => {
  assert.equal(kindAfterChange(SlotKind.SINGLE, 2), SlotKind.ROTATE);
  assert.equal(kindAfterChange(SlotKind.CIRCUIT, 3), SlotKind.CIRCUIT);
  assert.equal(kindAfterChange(SlotKind.ROTATE, 1), SlotKind.SINGLE);
  assert.deepEqual(moveItem([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 0, -1), [1, 2, 3]);
});

import { lastInSlot } from '../app/js/domain/history.js';
test('lastInSlot finds the newest entry in a slot for pre-filling a new variation', () => {
  const logs = [L('2026-01-01', 'dl', { weight: 180 }), L('2026-01-08', 'rdl', { weight: 135 }), L('2026-01-09', 'rdl', { weight: 999 })];
  assert.equal(lastInSlot(logs, 'a', 's1', '2026-01-09').weight, 135);
  assert.equal(lastInSlot(logs, 'a', 's1', null, (l) => l.exerciseId === 'dl').weight, 180);
});
