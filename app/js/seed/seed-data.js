// Starting data, copied from data/exercise-routine.xlsx (read once, never changed).
// Rotation variations not in the sheet are suggestions and have no history yet.

import { Measure as M, SlotKind as K, SCHEMA_VERSION, SETTINGS_ID } from '../domain/model.js';
import { DEFAULT_REST } from '../domain/sets.js';
import { addVariations } from './dumbbell-variations.js';

const ex = (id, name, measure = M.WEIGHT, link = '') => ({ id, name, measure, link });

const exercises = [
  ex('incline-bench-press', 'Incline Bench Press'),
  ex('bench-press', 'Bench Press'),
  ex('dumbbell-bench-press', 'Dumbbell Bench Press'),
  ex('decline-bench-press', 'Decline Bench Press'),
  ex('face-pulls', 'Face Pulls', M.WEIGHT, 'https://www.youtube.com/watch?v=nzTY7j9ocR8&t=3s'),
  ex('side-bend', 'Side Bend', M.WEIGHT, 'https://exrx.net/WeightExercises/Obliques/DBSideBend'),
  ex('front-plank', 'Front Plank', M.TIME),
  ex('bicycle-crunch', 'Bicycle Crunch', M.REPS),
  ex('deadlift', 'Deadlift'),
  ex('romanian-deadlift', 'Romanian Deadlift'),
  ex('single-leg-deadlift', 'Single Leg Deadlift'),
  ex('row', 'Row'),
  ex('single-arm-dumbbell-row', 'Single Arm Dumbbell Row'),
  ex('chest-supported-row', 'Chest Supported Row'),
  ex('shoulder-shrugs', 'Shoulder Shrugs'),
  ex('standing-calf-raise', 'Standing Calf Raise'),
  ex('military-press', 'Military Press'),
  ex('arnold-press', 'Arnold Press'),
  ex('seated-dumbbell-press', 'Seated Dumbbell Press'),
  ex('side-lat-raise', 'Side Lat Raise'),
  ex('bent-over-rear-delt-raise', 'Bent Over Rear Delt Raise'),
  ex('reverse-crunch', 'Reverse Crunch', M.REPS),
  ex('dumbbell-russian-twist', 'Dumbbell Russian Twist'),
  ex('dumbbell-squat', 'Dumbbell Squat'),
  ex('goblet-squat', 'Goblet Squat'),
  ex('bulgarian-split-squat', 'Bulgarian Split Squat'),
  ex('lunge', 'Lunge'),
  ex('reverse-lunge', 'Reverse Lunge'),
  ex('walking-lunge', 'Walking Lunge'),
  ex('farmers-walk-on-toes', "Farmer's Walk on Toes"),
  // Friday's incline press uses very different weights from Monday's, so the
  // sheet tracks it separately. Rename it in Settings > Edit plan if needed.
  ex('incline-bench-press-fri', 'Incline Bench Press (Friday)'),
  ex('dumbbell-curl', 'Dumbbell Curl'),
  ex('hammer-curl', 'Hammer Curl'),
  ex('incline-dumbbell-curl', 'Incline Dumbbell Curl'),
  ex('close-grip-dumbbell-press', 'Close Grip Dumbbell Press', M.WEIGHT,
    'https://www.muscleandstrength.com/exercises/close-grip-dumbbell-press.html'),
  ex('seated-tricep-press', 'Seated Tricep Press'),
  ex('weighted-crunch', 'Weighted Crunch'),
  ex('plank', 'Plank', M.TIME),
];

const slot = (id, kind, ...exerciseIds) => ({ id, kind, exerciseIds });

const days = [
  { id: 'mon', name: 'Monday', weekday: 1, slots: [
    slot('mon-1', K.SINGLE, 'incline-bench-press'),
    slot('mon-2', K.ROTATE, 'bench-press', 'dumbbell-bench-press', 'decline-bench-press'),
    slot('mon-3', K.SINGLE, 'face-pulls'),
    slot('mon-4', K.CIRCUIT, 'side-bend', 'front-plank', 'bicycle-crunch'),
  ] },
  { id: 'tue', name: 'Tuesday', weekday: 2, slots: [
    slot('tue-1', K.ROTATE, 'deadlift', 'romanian-deadlift', 'single-leg-deadlift'),
    slot('tue-2', K.ROTATE, 'row', 'single-arm-dumbbell-row', 'chest-supported-row'),
    slot('tue-3', K.SINGLE, 'shoulder-shrugs'),
    slot('tue-4', K.SINGLE, 'standing-calf-raise'),
  ] },
  { id: 'wed', name: 'Wednesday', weekday: 3, slots: [
    slot('wed-1', K.ROTATE, 'military-press', 'arnold-press', 'seated-dumbbell-press'),
    slot('wed-2', K.SINGLE, 'side-lat-raise'),
    slot('wed-3', K.SINGLE, 'bent-over-rear-delt-raise'),
    slot('wed-4', K.CIRCUIT, 'bicycle-crunch', 'reverse-crunch', 'dumbbell-russian-twist'),
  ] },
  { id: 'thu', name: 'Thursday', weekday: 4, slots: [
    slot('thu-1', K.ROTATE, 'dumbbell-squat', 'goblet-squat', 'bulgarian-split-squat'),
    slot('thu-2', K.ROTATE, 'lunge', 'reverse-lunge', 'walking-lunge'),
    slot('thu-3', K.SINGLE, 'single-leg-deadlift'),
    slot('thu-4', K.SINGLE, 'farmers-walk-on-toes'),
  ] },
  { id: 'fri', name: 'Friday', weekday: 5, slots: [
    slot('fri-1', K.SINGLE, 'incline-bench-press-fri'),
    slot('fri-2', K.ROTATE, 'dumbbell-curl', 'hammer-curl', 'incline-dumbbell-curl'),
    slot('fri-3', K.SINGLE, 'close-grip-dumbbell-press'),
    slot('fri-4', K.SINGLE, 'seated-tricep-press'),
    slot('fri-5', K.CIRCUIT, 'weighted-crunch', 'bicycle-crunch', 'plank'),
  ] },
];

const people = [{ id: 'andrew', name: 'Andrew' }];

let n = 0;
// The sheet stores one weight, one rep count and a number of sets.
// Each becomes that many completed work sets with the same numbers.
const log = (personId, date, slotId, exerciseId, v, note = '') => ({
  id: `seed-${++n}`,
  personId, date, slotId, exerciseId,
  dayId: slotId.split('-')[0],
  sets: Array.from({ length: v.s ?? 1 }, () => ({
    kind: 'work', weight: v.w ?? null, reps: v.r ?? null, seconds: v.t ?? null, done: true,
  })),
  complete: true, note, source: 'spreadsheet', createdAt: 0,
});

const A = 'andrew';
const logs = [
  log(A, '2026-07-20', 'mon-1', 'incline-bench-press', { w: 120, r: 9, s: 3 }),
  log(A, '2026-07-20', 'mon-2', 'bench-press', { w: 140, r: 4, s: 3 }),
  log(A, '2026-07-20', 'mon-3', 'face-pulls', { w: 40, r: 8, s: 3 }),
  log(A, '2026-07-20', 'mon-4', 'side-bend', { w: 70, s: 3 }),
  log(A, '2026-07-20', 'mon-4', 'front-plank', { t: 60, s: 3 }),
  log(A, '2026-07-20', 'mon-4', 'bicycle-crunch', { r: 12, s: 3 }),
  log(A, '2026-07-21', 'tue-1', 'deadlift', { w: 180, r: 12, s: 3 }),
  log(A, '2026-07-21', 'tue-2', 'row', { w: 100, r: 10, s: 3 }),
  log(A, '2026-07-21', 'tue-3', 'shoulder-shrugs', { w: 140, r: 12, s: 3 }),
  log(A, '2026-06-25', 'tue-4', 'standing-calf-raise', { w: 120, r: 12, s: 6 }),
  log(A, '2026-08-12', 'wed-1', 'military-press', { w: 40, r: 10, s: 3 }),
  log(A, '2026-08-12', 'wed-2', 'side-lat-raise', { w: 20, r: 10, s: 3 }),
  log(A, '2026-08-12', 'wed-3', 'bent-over-rear-delt-raise', { w: 25, r: 6, s: 3 }),
  log(A, '2026-08-12', 'wed-4', 'bicycle-crunch', { s: 3 }),
  log(A, '2026-08-12', 'wed-4', 'reverse-crunch', { s: 3 }),
  log(A, '2026-08-12', 'wed-4', 'dumbbell-russian-twist', { s: 3 }),
  log(A, '2026-04-30', 'thu-1', 'dumbbell-squat', { w: 180, r: 6, s: 3 }),
  log(A, '2026-05-18', 'thu-2', 'lunge', { w: 60, r: 10, s: 3 }),
  log(A, '2026-04-03', 'thu-3', 'single-leg-deadlift', { w: 80, r: 7, s: 3 }),
  log(A, '2026-01-26', 'thu-4', 'farmers-walk-on-toes', { w: 60, r: 6, s: 1 }),
  log(A, '2026-04-10', 'fri-1', 'incline-bench-press-fri', { w: 60, r: 6, s: 3 }),
  log(A, '2026-05-02', 'fri-2', 'dumbbell-curl', { w: 40, r: 5, s: 3 }),
  log(A, '2026-05-26', 'fri-3', 'close-grip-dumbbell-press', { w: 120, r: 6, s: 3 }),
  log(A, '2026-05-26', 'fri-4', 'seated-tricep-press', { w: 100, r: 6, s: 3 }),
  log(A, '2026-06-16', 'fri-5', 'weighted-crunch', { s: 3 }),
  log(A, '2026-06-16', 'fri-5', 'bicycle-crunch', { s: 3 }),
  log(A, '2026-06-16', 'fri-5', 'plank', { s: 3 }),
];

export function seedSnapshot() {
  const plan = addVariations({ exercises: structuredClone(exercises), days: structuredClone(days) });
  return {
    people: structuredClone(people),
    exercises: plan.exercises,
    days: plan.days,
    logs: structuredClone(logs),
    meta: [{ id: SETTINGS_ID, schemaVersion: SCHEMA_VERSION, activePersonId: A, rest: { ...DEFAULT_REST }, warmup: true }],
  };
}
