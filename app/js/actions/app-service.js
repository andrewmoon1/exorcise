// Application actions: one function per thing the user can do.
// Keeps an in-memory copy of all data for fast reads, and writes every
// change through the store. Screens call these and re-render on change.

import { Collections, SCHEMA_VERSION, SETTINGS_ID, SlotKind, SetKind, Measure, cleanNumber, newId, slugify } from '../domain/model.js';
import { DEFAULT_REST } from '../domain/sets.js';
import { toISODate } from '../domain/dates.js';
import { entriesForSlotOn } from '../domain/history.js';
import { kindAfterChange, moveItem, sortDays } from '../domain/plan.js';
import { migrateSnapshot } from '../storage/migrations.js';

const BACKUP_FORMAT = 'exorcise-backup';

export async function createAppService(store, { seed, now = () => new Date() } = {}) {
  let data = await loadAll(store);
  let settings = data.meta.find((m) => m.id === SETTINGS_ID);

  if (!settings) {
    // First start: load the starting data.
    const snap = seed ? seed() : emptySnapshot();
    await store.replaceAll(snap);
    data = await loadAll(store);
    settings = data.meta.find((m) => m.id === SETTINGS_ID);
  } else if ((settings.schemaVersion ?? 1) < SCHEMA_VERSION) {
    const upgraded = migrateSnapshot(data, settings.schemaVersion ?? 1);
    upgraded.meta = upgraded.meta.map((m) => (m.id === SETTINGS_ID ? { ...m, schemaVersion: SCHEMA_VERSION } : m));
    await store.replaceAll(upgraded);
    data = await loadAll(store);
    settings = data.meta.find((m) => m.id === SETTINGS_ID);
  }

  const listeners = new Set();
  const notify = () => { for (const fn of listeners) fn(); };

  const exerciseById = () => new Map(data.exercises.map((e) => [e.id, e]));
  let exMap = exerciseById();

  function refreshIndexes() {
    exMap = exerciseById();
    data.days = sortDays(data.days);
  }
  refreshIndexes();

  const today = () => toISODate(now());

  async function saveSettings(patch) {
    settings = { ...settings, ...patch };
    data.meta = [...data.meta.filter((m) => m.id !== SETTINGS_ID), settings];
    await store.put('meta', settings);
  }

  async function saveDay(day) {
    data.days = data.days.map((d) => (d.id === day.id ? day : d));
    await store.put('days', day);
    refreshIndexes();
    notify();
  }

  function getDay(dayId) {
    const d = data.days.find((x) => x.id === dayId);
    if (!d) throw new Error(`No day ${dayId}`);
    return d;
  }

  /** Find an exercise by name (case-insensitive), or create it. */
  async function ensureExercise(name, measure = Measure.WEIGHT) {
    const clean = String(name).trim().replace(/\s+/g, ' ');
    if (!clean) throw new Error('Exercise name is empty');
    const found = data.exercises.find((e) => e.name.toLowerCase() === clean.toLowerCase());
    if (found) return found;
    let id = slugify(clean) || newId('ex');
    if (exMap.has(id)) id = newId(id);
    const e = { id, name: clean, measure, link: '' };
    data.exercises.push(e);
    await store.put('exercises', e);
    refreshIndexes();
    return e;
  }

  return {
    // ---- reads ----
    get people() { return data.people; },
    get days() { return data.days; },
    get exercises() { return data.exercises; },
    get logs() { return data.logs; },
    get activePerson() { return data.people.find((p) => p.id === settings.activePersonId) ?? data.people[0]; },
    exercise: (id) => exMap.get(id),
    day: getDay,
    today,
    storeKind: store.kind,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    get rest() { return { ...DEFAULT_REST, ...(settings.rest ?? {}) }; },
    get warmupOn() { return settings.warmup !== false; },

    // ---- workout ----
    /**
     * Save today's sets for a slot. `entries` = [{ exerciseId, sets }].
     * Called after every ticked set, so progress survives closing the app.
     * Replaces what was saved for this slot today.
     */
    async saveSlot({ dayId, slotId, entries, complete = false, date = today() }) {
      const personId = this.activePerson.id;
      const cleaned = entries.map(({ exerciseId, sets }) => {
        const e = exMap.get(exerciseId);
        if (!e) throw new Error(`Unknown exercise ${exerciseId}`);
        const clean = sets.map((x) => {
          try {
            return {
              kind: x.kind === SetKind.WARMUP ? SetKind.WARMUP : SetKind.WORK,
              weight: cleanNumber('weight', x.weight),
              reps: cleanNumber('reps', x.reps),
              seconds: cleanNumber('seconds', x.seconds),
              done: Boolean(x.done),
            };
          } catch (err) {
            throw new Error(`${e.name}: ${err.message}`);
          }
        });
        return { exerciseId, sets: clean };
      });
      const old = entriesForSlotOn(data.logs, personId, slotId, date);
      const created = old[0]?.createdAt ?? now().getTime();
      const recs = cleaned.map(({ exerciseId, sets }, i) => ({
        id: old.find((o) => o.exerciseId === exerciseId)?.id ?? newId('log'),
        personId, date, dayId, slotId, exerciseId, sets, complete, note: '', createdAt: created + i,
      }));
      const keep = new Set(recs.map((r) => r.id));
      const gone = old.filter((o) => !keep.has(o.id)).map((o) => o.id);
      if (gone.length) await store.deleteMany('logs', gone);
      await store.putMany('logs', recs);
      const oldIds = new Set(old.map((l) => l.id));
      data.logs = [...data.logs.filter((l) => !oldIds.has(l.id)), ...recs];
      notify();
    },

    /** Open a finished slot again for changes. */
    async reopenSlot({ slotId, date = today() }) {
      const old = entriesForSlotOn(data.logs, this.activePerson.id, slotId, date);
      if (!old.length) return;
      const recs = old.map((l) => ({ ...l, complete: false }));
      await store.putMany('logs', recs);
      const ids = new Set(old.map((l) => l.id));
      data.logs = [...data.logs.filter((l) => !ids.has(l.id)), ...recs];
      notify();
    },

    /** Remove everything logged for a slot today. */
    async clearSlot({ slotId, date = today() }) {
      const old = entriesForSlotOn(data.logs, this.activePerson.id, slotId, date);
      if (!old.length) return;
      await store.deleteMany('logs', old.map((l) => l.id));
      const ids = new Set(old.map((l) => l.id));
      data.logs = data.logs.filter((l) => !ids.has(l.id));
      notify();
    },

    async deleteLog(logId) {
      await store.delete('logs', logId);
      data.logs = data.logs.filter((l) => l.id !== logId);
      notify();
    },

    // ---- settings ----
    async setRest(key, seconds) {
      if (!(key in DEFAULT_REST)) return;
      const v = cleanNumber('seconds', seconds);
      await saveSettings({ rest: { ...this.rest, [key]: v ?? DEFAULT_REST[key] } });
      notify();
    },
    async setWarmup(on) {
      await saveSettings({ warmup: Boolean(on) });
      notify();
    },

    // ---- plan editing ----
    async addSlot(dayId, exerciseName) {
      const e = await ensureExercise(exerciseName);
      const day = getDay(dayId);
      const s = { id: newId('slot'), kind: SlotKind.SINGLE, exerciseIds: [e.id] };
      await saveDay({ ...day, slots: [...day.slots, s] });
    },
    async removeSlot(dayId, slotId) {
      const day = getDay(dayId);
      await saveDay({ ...day, slots: day.slots.filter((s) => s.id !== slotId) });
    },
    async moveSlot(dayId, slotId, delta) {
      const day = getDay(dayId);
      const i = day.slots.findIndex((s) => s.id === slotId);
      await saveDay({ ...day, slots: moveItem(day.slots, i, delta) });
    },
    async addToSlot(dayId, slotId, exerciseName) {
      const e = await ensureExercise(exerciseName);
      const day = getDay(dayId);
      await saveDay({
        ...day,
        slots: day.slots.map((s) => {
          if (s.id !== slotId || s.exerciseIds.includes(e.id)) return s;
          const ids = [...s.exerciseIds, e.id];
          return { ...s, exerciseIds: ids, kind: kindAfterChange(s.kind, ids.length) };
        }),
      });
    },
    async removeFromSlot(dayId, slotId, exerciseId) {
      const day = getDay(dayId);
      const slots = [];
      for (const s of day.slots) {
        if (s.id !== slotId) { slots.push(s); continue; }
        const ids = s.exerciseIds.filter((x) => x !== exerciseId);
        if (ids.length) slots.push({ ...s, exerciseIds: ids, kind: kindAfterChange(s.kind, ids.length) });
      }
      await saveDay({ ...day, slots });
    },
    async setSlotKind(dayId, slotId, kind) {
      const day = getDay(dayId);
      await saveDay({
        ...day,
        slots: day.slots.map((s) => (s.id === slotId && s.exerciseIds.length > 1 ? { ...s, kind } : s)),
      });
    },
    async updateExercise(id, patch) {
      const e = exMap.get(id);
      if (!e) return;
      const next = { ...e, ...patch, id };
      if (typeof next.name === 'string') next.name = next.name.trim() || e.name;
      if (!Object.values(Measure).includes(next.measure)) next.measure = e.measure;
      data.exercises = data.exercises.map((x) => (x.id === id ? next : x));
      await store.put('exercises', next);
      refreshIndexes();
      notify();
    },

    // ---- backup ----
    exportBackup() {
      return {
        format: BACKUP_FORMAT,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: now().toISOString(),
        data: Object.fromEntries(Collections.map((c) => [c, data[c]])),
      };
    },
    async importBackup(backup) {
      if (!backup || backup.format !== BACKUP_FORMAT || typeof backup.data !== 'object') {
        throw new Error('This file is not an Exorcise backup.');
      }
      for (const c of Collections) {
        if (!Array.isArray(backup.data[c])) throw new Error(`Backup is missing "${c}".`);
      }
      const upgraded = migrateSnapshot(backup.data, backup.schemaVersion ?? 1);
      if (!upgraded.meta.some((m) => m.id === SETTINGS_ID)) throw new Error('Backup has no settings.');
      upgraded.meta = upgraded.meta.map((m) => (m.id === SETTINGS_ID ? { ...m, schemaVersion: SCHEMA_VERSION } : m));
      await store.replaceAll(upgraded);
      data = await loadAll(store);
      settings = data.meta.find((m) => m.id === SETTINGS_ID);
      refreshIndexes();
      notify();
    },
  };
}

async function loadAll(store) {
  const out = {};
  for (const c of Collections) out[c] = await store.getAll(c);
  return out;
}

function emptySnapshot() {
  const person = { id: 'me', name: 'Me' };
  return {
    people: [person], exercises: [], days: [], logs: [],
    meta: [{ id: SETTINGS_ID, schemaVersion: SCHEMA_VERSION, activePersonId: person.id }],
  };
}
