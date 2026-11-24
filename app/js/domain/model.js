// Core record shapes and constants. No storage or UI code here.

export const SCHEMA_VERSION = 3;

/** How an exercise is measured. Decides which number fields are shown. */
export const Measure = Object.freeze({
  WEIGHT: 'weight', // weight + reps + sets
  REPS: 'reps',     // reps + sets (bodyweight)
  TIME: 'time',     // seconds + sets (holds such as plank)
});

/** What a slot (one position in a day) holds. */
export const SlotKind = Object.freeze({
  SINGLE: 'single',   // one exercise
  ROTATE: 'rotate',   // variations, one per workout, in turn
  CIRCUIT: 'circuit', // several exercises done together
});

/** Collections that the storage layer must provide. */
export const Collections = Object.freeze(['people', 'exercises', 'days', 'logs', 'meta']);

export const SETTINGS_ID = 'settings';

export function newId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export function slugify(name) {
  return String(name).toLowerCase().trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Fields that a log entry records for each measure, in display order. */
export function fieldsFor(measure) {
  switch (measure) {
    case Measure.TIME: return ['seconds', 'sets'];
    case Measure.REPS: return ['reps', 'sets'];
    default: return ['weight', 'reps', 'sets'];
  }
}

export const FieldInfo = Object.freeze({
  weight: { label: 'lb', step: 5, min: 0, decimals: true },
  reps: { label: 'reps', step: 1, min: 0 },
  sets: { label: 'sets', step: 1, min: 0 },
  seconds: { label: 'sec', step: 15, min: 0 },
});

export const SetKind = Object.freeze({ WARMUP: 'warmup', WORK: 'work' });

/** Clean one number typed by the user. Returns null for empty, throws for bad input. */
export function cleanNumber(field, raw) {
  if (raw === '' || raw == null) return null;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0) throw new Error(`${FieldInfo[field]?.label ?? field} must be 0 or more`);
  return FieldInfo[field]?.decimals ? Math.round(v * 100) / 100 : Math.round(v);
}

export function formatSeconds(s) {
  if (s >= 60 && s % 60 === 0) return `${s / 60} min`;
  if (s > 60) return `${Math.floor(s / 60)} min ${s % 60} sec`;
  return `${s} sec`;
}

/** "1:05" for a countdown. */
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
