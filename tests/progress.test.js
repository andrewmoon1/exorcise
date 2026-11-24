import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatedMax, progressSeries, weekStart, weeklyActivity, monthlyActivity, metricsFor } from '../app/js/domain/progress.js';
import { niceTicks } from '../app/js/ui/charts.js';
import { Measure } from '../app/js/domain/model.js';
import { createMemoryStore } from '../app/js/storage/memory-store.js';
import { createAppService } from '../app/js/actions/app-service.js';
import { seedSnapshot } from '../app/js/seed/seed-data.js';

const W = (weight, reps, done = true, kind = 'work') => ({ kind, weight, reps, seconds: null, done });
const L = (date, sets, extra = {}) => ({ id: date + Math.random(), personId: 'a', exerciseId: 'dl', slotId: 's', date, sets, ...extra });

test('estimated 1-rep max uses the Epley formula and caps reps at 12', () => {
  assert.equal(estimatedMax(100, 1), 100);
  assert.equal(estimatedMax(100, 10), 133);
  assert.equal(estimatedMax(100, 20), estimatedMax(100, 12));
  assert.equal(estimatedMax(0, 5), null);
  assert.equal(estimatedMax(100, null), null);
});

test('progress series is oldest first, one point per date, done work sets only', () => {
  const logs = [
    L('2026-03-01', [W(150, 5), W(200, 5, false), W(300, 5, true, 'warmup')]),
    L('2026-01-01', [W(100, 8), W(110, 6)]),
    L('2026-03-01', [W(160, 3)]),
    L('2026-02-01', [W(120, 8)], { personId: 'b' }),
    L('2026-02-02', [W(120, 8)], { exerciseId: 'other' }),
  ];
  const s = progressSeries(logs, 'a', 'dl', 'weight');
  assert.deepEqual(s.map((p) => [p.date, p.value]), [['2026-01-01', 110], ['2026-03-01', 160]]);
  const v = progressSeries(logs, 'a', 'dl', 'volume');
  assert.deepEqual(v.map((p) => p.value), [100 * 8 + 110 * 6, 750]);
});

test('workouts without the number are left out of the series', () => {
  const logs = [L('2026-01-01', [W(null, null)]), L('2026-01-08', [W(50, 10)])];
  assert.deepEqual(progressSeries(logs, 'a', 'dl', 'weight').map((p) => p.date), ['2026-01-08']);
  assert.deepEqual(progressSeries(logs, 'a', 'dl', 'nope'), []);
});

test('metrics depend on how the exercise is measured', () => {
  assert.deepEqual(metricsFor(Measure.WEIGHT), ['weight', 'max', 'volume']);
  assert.deepEqual(metricsFor(Measure.TIME), ['seconds']);
});

test('weeks start on Monday', () => {
  assert.equal(weekStart('2026-11-24'), '2026-11-23'); // Tuesday
  assert.equal(weekStart('2026-11-23'), '2026-11-23'); // Monday
  assert.equal(weekStart('2026-11-29'), '2026-11-23'); // Sunday
});

test('weekly activity counts distinct workout days per week', () => {
  const logs = [
    L('2026-11-23', [W(1, 1)]), L('2026-11-23', [W(1, 1)], { exerciseId: 'x' }),
    L('2026-11-24', [W(1, 1)]),
    L('2026-11-17', [W(1, 1)]),
    L('2026-11-18', [W(1, 1, false)]), // nothing done
    L('2026-01-01', [W(1, 1)]),        // outside the range
  ];
  const weeks = weeklyActivity(logs, 'a', '2026-11-24', 12);
  assert.equal(weeks.length, 12);
  assert.equal(weeks.at(-1).start, '2026-11-23');
  assert.equal(weeks.at(-1).days, 2);
  assert.equal(weeks.at(-2).days, 1);
  assert.equal(weeks.reduce((t, w) => t + w.days, 0), 3);
});

test('monthly activity covers 12 calendar months ending this month', () => {
  const logs = [L('2026-11-02', [W(1, 1)]), L('2025-12-31', [W(1, 1)]), L('2025-11-30', [W(1, 1)])];
  const months = monthlyActivity(logs, 'a', '2026-11-24', 12);
  assert.equal(months[0].start, '2025-12-01');
  assert.equal(months[0].end, '2025-12-31');
  assert.equal(months.at(-1).end, '2026-11-30');
  assert.deepEqual([months[0].days, months.at(-1).days], [1, 1]);
});

test('the value axis uses round steps that cover the data', () => {
  const t = niceTicks(95, 182);
  assert.ok(t[0] <= 95 && t.at(-1) >= 182);
  const step = t[1] - t[0];
  assert.ok([10, 20, 25, 50].includes(step), `step ${step}`);
  assert.deepEqual(niceTicks(0, 3, 3), [0, 1, 2, 3]);
});

test('both spreadsheets give the deadlift chart a history from 2023 to 2026', async () => {
  const app = await createAppService(createMemoryStore(), { seed: seedSnapshot, now: () => new Date('2026-11-24T10:00:00') });
  const s = progressSeries(app.logs, 'andrew', 'deadlift', 'weight');
  assert.deepEqual(s.map((p) => [p.date, p.value]), [
    ['2023-06-29', 105], ['2023-07-06', 155], ['2024-04-23', 135], ['2024-06-10', 175],
    ['2024-11-18', 155], ['2025-08-25', 185], ['2026-07-21', 180],
  ]);
  assert.equal(progressSeries(app.logs, 'andrew', 'deadlift', 'max').at(-1).value, 252);
  const months = monthlyActivity(app.logs, 'andrew', '2026-11-24', 12);
  assert.ok(months.reduce((t, m) => t + m.days, 0) >= 10);
});
