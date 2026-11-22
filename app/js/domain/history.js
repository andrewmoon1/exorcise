// Pure queries over log entries.
// A log entry = one exercise in one workout: { personId, date, slotId, exerciseId, sets: [...], complete }.

const hasDoneSet = (l) => (l.sets ?? []).some((s) => s.done);

/** Sort order: newest date first, then newest created first. */
export function newestFirst(a, b) {
  return b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);
}

function newest(logs, test) {
  let best = null;
  for (const l of logs) if (test(l) && (!best || newestFirst(l, best) < 0)) best = l;
  return best;
}

/** All workouts of one person for one exercise (with at least one set done), newest first. */
export function historyFor(logs, personId, exerciseId) {
  return logs
    .filter((l) => l.personId === personId && l.exerciseId === exerciseId && hasDoneSet(l))
    .sort(newestFirst);
}

/**
 * The most recent time a person did an exercise, strictly before `beforeDate`
 * (so today's entry does not hide the previous workout). Null if never.
 */
export function lastPerformance(logs, personId, exerciseId, beforeDate) {
  return newest(logs, (l) => l.personId === personId && l.exerciseId === exerciseId
    && (!beforeDate || l.date < beforeDate) && hasDoneSet(l));
}

/**
 * The most recent entry in a slot before `beforeDate`, for any exercise that
 * passes `accept`. Used to pre-fill a variation the person has never done
 * with the numbers from the variation done last time.
 */
export function lastInSlot(logs, personId, slotId, beforeDate, accept = () => true) {
  return newest(logs, (l) => l.personId === personId && l.slotId === slotId
    && (!beforeDate || l.date < beforeDate) && hasDoneSet(l) && accept(l));
}

/** Entries a person logged for a slot on a given date. */
export function entriesForSlotOn(logs, personId, slotId, date) {
  return logs.filter((l) => l.personId === personId && l.slotId === slotId && l.date === date);
}

/** Newest log date for each exercise, as a Map exerciseId -> date. */
export function lastDates(logs, personId) {
  const out = new Map();
  for (const l of logs) {
    if (l.personId !== personId || !hasDoneSet(l)) continue;
    const prev = out.get(l.exerciseId);
    if (!prev || l.date > prev) out.set(l.exerciseId, l.date);
  }
  return out;
}
