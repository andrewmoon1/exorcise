// Adds the history from the older workout sheet (data/Workouts.xlsx) to the data.
// Used for new installs (seed) and to upgrade existing data (migration v3),
// so both end up with the same history.

import { SETTINGS_ID } from '../domain/model.js';
import { OLD_EXERCISES, OLD_LOGS } from './workouts-history.js';

/**
 * Add the old exercises and log entries. An exercise the user already has
 * with the same name is reused. Entries already added are skipped, so running
 * this twice changes nothing. Returns new data.
 */
export function addOldHistory(data) {
  const exercises = [...data.exercises];
  const known = new Set(exercises.map((e) => e.id));
  const byName = new Map(exercises.map((e) => [e.name.toLowerCase(), e.id]));
  const idFor = new Map();
  for (const e of OLD_EXERCISES) {
    const id = known.has(e.id) ? e.id : byName.get(e.name.toLowerCase()) ?? e.id;
    if (!known.has(id)) {
      exercises.push({ ...e, link: '' });
      known.add(id);
      byName.set(e.name.toLowerCase(), id);
    }
    idFor.set(e.id, id);
  }

  const settings = (data.meta ?? []).find((m) => m.id === SETTINGS_ID);
  const personId = settings?.activePersonId ?? data.people?.[0]?.id;
  if (!personId) return { ...data, exercises };

  const have = new Set(data.logs.map((l) => l.id));
  const logs = [...data.logs];
  for (const [date, exId, w, r, s, note = ''] of OLD_LOGS) {
    const exerciseId = idFor.get(exId) ?? exId;
    const id = `old-${exId}-${date}`;
    if (have.has(id) || !known.has(exerciseId)) continue;
    logs.push({
      id, personId, date, dayId: null, slotId: null, exerciseId,
      sets: Array.from({ length: s }, () => ({ kind: 'work', weight: w, reps: r, seconds: null, done: true })),
      complete: true, note, source: 'spreadsheet', createdAt: 0,
    });
  }
  return { ...data, exercises, logs };
}
