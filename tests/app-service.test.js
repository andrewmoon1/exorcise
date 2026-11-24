import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../app/js/storage/memory-store.js';
import { createAppService } from '../app/js/actions/app-service.js';
import { seedSnapshot } from '../app/js/seed/seed-data.js';
import { nextExerciseId } from '../app/js/domain/rotation.js';
import { lastPerformance } from '../app/js/domain/history.js';
import { OLD_EXERCISES, OLD_LOGS } from '../app/js/seed/workouts-history.js';

const fixedNow = (iso) => () => new Date(`${iso}T10:00:00`);
const W = (weight, reps, done = true) => ({ kind: 'work', weight, reps, seconds: null, done });

async function setup(iso = '2026-11-24') {
  const store = createMemoryStore();
  const app = await createAppService(store, { seed: seedSnapshot, now: fixedNow(iso) });
  return { store, app };
}

test('first start loads the spreadsheet data', async () => {
  const { app } = await setup();
  assert.equal(app.days.length, 5);
  assert.equal(app.people.length, 1);
  const last = lastPerformance(app.logs, 'andrew', 'deadlift');
  assert.equal(last.sets.length, 3);
  assert.deepEqual(last.sets[0], { kind: 'work', weight: 180, reps: 12, seconds: null, done: true });
  assert.equal(lastPerformance(app.logs, 'andrew', 'standing-calf-raise').sets.length, 6);
});

test('every exercise and slot in the seed is consistent', async () => {
  const { app } = await setup();
  for (const d of app.days) for (const s of d.slots) for (const id of s.exerciseIds) {
    assert.ok(app.exercise(id), `missing exercise ${id}`);
  }
  for (const l of app.logs) {
    assert.ok(app.exercise(l.exerciseId), `log for missing exercise ${l.exerciseId}`);
    if (l.id.startsWith('old-')) continue; // old sheet history is not tied to a plan slot
    assert.ok(app.days.find((d) => d.id === l.dayId)?.slots.some((s) => s.id === l.slotId), `log for missing slot ${l.slotId}`);
  }
});

test('Tuesday deadlift slot rotates to Romanian Deadlift after the seeded Deadlift', async () => {
  const { app } = await setup();
  assert.equal(nextExerciseId(app.day('tue').slots[0], app.logs, 'andrew', app.today()), 'romanian-deadlift');
});

test('saving after each set keeps progress, re-saving replaces it, clear removes it', async () => {
  const { app, store } = await setup();
  const base = { dayId: 'tue', slotId: 'tue-1' };
  await app.saveSlot({ ...base, entries: [{ exerciseId: 'romanian-deadlift', sets: [W(135, 8), W(135, 8, false)] }] });
  await app.saveSlot({ ...base, entries: [{ exerciseId: 'romanian-deadlift', sets: [W(135, 8), W(135, 6)] }], complete: true });
  const todays = app.logs.filter((l) => l.date === '2026-11-24');
  assert.equal(todays.length, 1);
  assert.equal(todays[0].complete, true);
  assert.deepEqual(todays[0].sets.map((s) => s.reps), [8, 6]);
  assert.equal((await store.getAll('logs')).length, app.logs.length);
  await app.reopenSlot({ slotId: 'tue-1' });
  assert.equal(app.logs.find((l) => l.date === '2026-11-24').complete, false);
  await app.clearSlot({ slotId: 'tue-1' });
  assert.equal(app.logs.filter((l) => l.date === '2026-11-24').length, 0);
});

test('a started entry with nothing ticked does not count as last time or move the rotation', async () => {
  const { app, store } = await setup('2026-11-24');
  await app.saveSlot({ dayId: 'tue', slotId: 'tue-1', entries: [{ exerciseId: 'romanian-deadlift', sets: [W(135, 8, false)] }] });
  const later = await createAppService(store, { now: fixedNow('2026-12-01') });
  assert.equal(lastPerformance(later.logs, 'andrew', 'romanian-deadlift', later.today()), null);
  assert.equal(nextExerciseId(later.day('tue').slots[0], later.logs, 'andrew', later.today()), 'romanian-deadlift');
});

test('rest times and warm-up switch are saved', async () => {
  const { app, store } = await setup();
  assert.equal(app.rest.warmup1, 60);
  assert.equal(app.warmupOn, true);
  await app.setRest('warmup1', 90);
  await app.setWarmup(false);
  const again = await createAppService(store, { now: fixedNow('2026-11-25') });
  assert.equal(again.rest.warmup1, 90);
  assert.equal(again.rest.work, 180);
  assert.equal(again.warmupOn, false);
});

test('bad values are refused', async () => {
  const { app } = await setup();
  await assert.rejects(app.saveSlot({ dayId: 'tue', slotId: 'tue-3', entries: [{ exerciseId: 'shoulder-shrugs', sets: [W(-1, 1)] }] }));
});

test('plan editing: add, rotate, circuit, move and remove', async () => {
  const { app } = await setup();
  await app.addSlot('tue', 'Pull Up');
  const added = app.day('tue').slots.at(-1);
  assert.equal(app.exercise(added.exerciseIds[0]).name, 'Pull Up');
  await app.addToSlot('tue', added.id, 'chin up');
  assert.equal(app.day('tue').slots.at(-1).kind, 'rotate');
  await app.setSlotKind('tue', added.id, 'circuit');
  assert.equal(app.day('tue').slots.at(-1).kind, 'circuit');
  await app.addToSlot('tue', added.id, 'pull up'); // existing name: no duplicate
  assert.equal(app.day('tue').slots.at(-1).exerciseIds.length, 2);
  await app.moveSlot('tue', added.id, -1);
  assert.equal(app.day('tue').slots.at(-2).id, added.id);
  await app.removeSlot('tue', added.id);
  assert.equal(app.day('tue').slots.length, 4);
});

test('backup round trip restores everything', async () => {
  const { app } = await setup();
  await app.saveSlot({ dayId: 'tue', slotId: 'tue-3', entries: [{ exerciseId: 'shoulder-shrugs', sets: [W(150, 12)] }], complete: true });
  const backup = JSON.parse(JSON.stringify(app.exportBackup()));
  const { app: fresh } = await setup();
  await fresh.importBackup(backup);
  assert.equal(fresh.logs.length, app.logs.length);
  await assert.rejects(fresh.importBackup({ hello: 1 }));
});

test('data survives a restart with the same store', async () => {
  const { app, store } = await setup();
  await app.saveSlot({ dayId: 'tue', slotId: 'tue-3', entries: [{ exerciseId: 'shoulder-shrugs', sets: [W(150, 12)] }], complete: true });
  const again = await createAppService(store, { seed: seedSnapshot, now: fixedNow('2026-11-25') });
  assert.equal(lastPerformance(again.logs, 'andrew', 'shoulder-shrugs', again.today()).sets[0].weight, 150);
});

import { DUMBBELL_VARIATIONS } from '../app/js/seed/dumbbell-variations.js';
import { SCHEMA_VERSION } from '../app/js/domain/model.js';

test('new installs get the dumbbell variations', async () => {
  const { app } = await setup();
  assert.deepEqual(app.day('mon').slots[0].exerciseIds, ['incline-bench-press', 'incline-dumbbell-press']);
  assert.equal(app.day('mon').slots[0].kind, 'rotate');
  assert.ok(app.day('fri').slots[0].exerciseIds.includes('incline-dumbbell-press'));
  assert.equal(app.day('tue').slots[0].exerciseIds.at(-1), 'dumbbell-romanian-deadlift');
});

test('upgrading version 1 data adds dumbbell variations and keeps history and edits', async () => {
  // Build data as version 1 stored it: no dumbbell variations.
  const snap = seedSnapshot();
  const added = new Set(DUMBBELL_VARIATIONS.map((v) => v.exercise.id));
  snap.exercises = snap.exercises.filter((e) => !added.has(e.id));
  snap.days = snap.days.map((d) => ({
    ...d,
    slots: d.slots
      .filter((s) => s.id !== 'tue-3') // the user removed shrugs from the plan
      .map((s) => {
        const ids = s.exerciseIds.filter((id) => !added.has(id));
        return { ...s, exerciseIds: ids, kind: ids.length === 1 ? 'single' : s.kind };
      }),
  }));
  snap.meta = [{ ...snap.meta[0], schemaVersion: 1 }];
  snap.logs.push({ id: 'mine', personId: 'andrew', date: '2026-11-23', dayId: 'mon', slotId: 'mon-1', exerciseId: 'incline-bench-press', sets: [W(125, 8)], complete: true, note: '', createdAt: 1 });
  const logCount = snap.logs.length;

  const store = createMemoryStore(snap);
  const app = await createAppService(store, { now: fixedNow('2026-11-24') });
  assert.equal(app.logs.length, logCount);
  assert.deepEqual(app.day('mon').slots[0].exerciseIds, ['incline-bench-press', 'incline-dumbbell-press']);
  assert.equal(app.day('mon').slots[0].kind, 'rotate');
  // Incline was done last, so the dumbbell variation is next.
  assert.equal(nextExerciseId(app.day('mon').slots[0], app.logs, 'andrew', app.today()), 'incline-dumbbell-press');
  assert.ok(!app.day('tue').slots.some((s) => s.id === 'tue-3'), 'removed slot stays removed');
  assert.equal(app.exercises.filter((e) => e.id === 'incline-dumbbell-press').length, 1);
  assert.equal((await store.getAll('meta'))[0].schemaVersion, SCHEMA_VERSION);

  // Running the upgrade again changes nothing.
  const again = await createAppService(store, { now: fixedNow('2026-11-24') });
  assert.equal(again.day('mon').slots[0].exerciseIds.length, 2);
});

test('upgrading version 2 data adds the old sheet history once, and keeps what the user logged', async () => {
  const snap = seedSnapshot();
  snap.logs = snap.logs.filter((l) => !l.id.startsWith('old-'));
  const oldOnly = new Set(OLD_EXERCISES.map((e) => e.id));
  snap.exercises = snap.exercises.filter((e) => !oldOnly.has(e.id));
  // The user already made a "Squat" exercise with another id.
  snap.exercises.push({ id: 'my-squat', name: 'squat', measure: 'weight', link: '' });
  snap.meta = [{ ...snap.meta[0], schemaVersion: 2 }];
  snap.logs.push({ id: 'mine', personId: 'andrew', date: '2026-11-23', dayId: 'tue', slotId: 'tue-1', exerciseId: 'deadlift', sets: [W(200, 5)], complete: true, note: '', createdAt: 1 });
  const before = snap.logs.length;

  const store = createMemoryStore(snap);
  const app = await createAppService(store, { now: fixedNow('2026-11-24') });
  assert.equal(app.logs.length, before + OLD_LOGS.length);
  assert.ok(app.logs.some((l) => l.id === 'mine'));
  assert.equal(lastPerformance(app.logs, 'andrew', 'deadlift').id, 'mine');
  assert.ok(app.logs.some((l) => l.id === 'old-deadlift-2025-08-25' && l.sets[0].weight === 185));
  // Squat history goes to the user's own Squat, not a second one.
  assert.equal(app.exercises.filter((e) => e.name.toLowerCase() === 'squat').length, 1);
  assert.ok(app.logs.some((l) => l.exerciseId === 'my-squat' && l.date === '2025-08-25'));
  // Old entries are not tied to a plan slot, so the rotation is unchanged.
  assert.equal(nextExerciseId(app.day('tue').slots[0], app.logs, 'andrew', '2026-11-30'), 'romanian-deadlift');

  const again = await createAppService(store, { now: fixedNow('2026-11-24') });
  assert.equal(again.logs.length, before + OLD_LOGS.length);
});
