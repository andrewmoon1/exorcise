// Dumbbell variations added to the plan in schema version 2.
// Used for new installs (seed) and to upgrade existing data (migration),
// so both always end up with the same plan.

import { SlotKind } from '../domain/model.js';

const ex = (id, name) => ({ id, name, measure: 'weight', link: '' });

export const DUMBBELL_VARIATIONS = Object.freeze([
  { slotId: 'mon-1', exercise: ex('incline-dumbbell-press', 'Incline Dumbbell Press') },
  { slotId: 'tue-1', exercise: ex('dumbbell-romanian-deadlift', 'Dumbbell Romanian Deadlift') },
  { slotId: 'tue-3', exercise: ex('dumbbell-shrug', 'Dumbbell Shrug') },
  { slotId: 'tue-4', exercise: ex('single-leg-dumbbell-calf-raise', 'Single Leg Dumbbell Calf Raise') },
  { slotId: 'fri-1', exercise: ex('incline-dumbbell-press', 'Incline Dumbbell Press') },
  { slotId: 'fri-4', exercise: ex('dumbbell-skull-crusher', 'Dumbbell Skull Crusher') },
]);

/**
 * Add each variation to its slot. Skips slots the user removed and
 * variations already there. Never touches history. Returns new data.
 */
export function addVariations(data, variations = DUMBBELL_VARIATIONS) {
  const exercises = [...data.exercises];
  const known = new Set(exercises.map((e) => e.id));
  const byName = new Map(exercises.map((e) => [e.name.toLowerCase(), e.id]));
  const days = data.days.map((day) => ({
    ...day,
    slots: day.slots.map((slot) => {
      let s = slot;
      for (const v of variations.filter((x) => x.slotId === slot.id)) {
        // Reuse an exercise the user already made with the same name.
        let id = byName.get(v.exercise.name.toLowerCase()) ?? v.exercise.id;
        if (!known.has(id)) {
          exercises.push({ ...v.exercise });
          known.add(id);
          byName.set(v.exercise.name.toLowerCase(), id);
        }
        if (s.exerciseIds.includes(id)) continue;
        const ids = [...s.exerciseIds, id];
        s = { ...s, exerciseIds: ids, kind: s.kind === SlotKind.SINGLE ? SlotKind.ROTATE : s.kind };
      }
      return s;
    }),
  }));
  return { ...data, exercises, days };
}
