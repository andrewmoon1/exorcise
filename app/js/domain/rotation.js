// Rotation rule for slots that hold exercise variations.
//
// The next variation is derived from history, never stored: find the
// variation the person did most recently in this slot and take the one
// after it. This cannot drift out of step when workouts are skipped,
// undone or swapped.

import { SlotKind } from './model.js';
import { newestFirst } from './history.js';

export function nextExerciseId(slot, logs, personId, beforeDate) {
  const ids = slot.exerciseIds;
  if (slot.kind !== SlotKind.ROTATE || ids.length < 2) return ids[0];
  let last = null;
  for (const l of logs) {
    if (l.personId !== personId || l.slotId !== slot.id) continue;
    if (beforeDate && l.date >= beforeDate) continue;
    if (!ids.includes(l.exerciseId)) continue;
    if (!(l.sets ?? []).some((x) => x.done)) continue;
    if (!last || newestFirst(l, last) < 0) last = l;
  }
  if (!last) return ids[0];
  return ids[(ids.indexOf(last.exerciseId) + 1) % ids.length];
}

/** The exercise ids a slot asks for in one workout. */
export function exercisesForWorkout(slot, chosenId) {
  if (slot.kind === SlotKind.CIRCUIT) return [...slot.exerciseIds];
  return [chosenId ?? slot.exerciseIds[0]];
}
