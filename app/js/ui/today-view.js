// The main screen: today's plan, one card per slot.
// Each set is one tap on its check button; the rest timer starts by itself.

import { h } from './dom.js';
import { howToLink, lastLine, stepper, topBar, emptyState } from './components.js';
import { Measure, SlotKind, SetKind, formatSeconds } from '../domain/model.js';
import { isoWeekday, formatDate } from '../domain/dates.js';
import { entriesForSlotOn, lastPerformance, lastInSlot } from '../domain/history.js';
import { nextExerciseId } from '../domain/rotation.js';
import { dayForWeekday } from '../domain/plan.js';
import {
  planSets, withWorkingWeight, addWorkSet, removeWorkSet, restAfter, summarize, workSets,
  DEFAULT_WORK_SETS, DEFAULT_REPS, DEFAULT_SECONDS,
} from '../domain/sets.js';

const SHORT = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
const clone = (v) => JSON.parse(JSON.stringify(v));

export function renderToday(app, ui, dayId) {
  const today = app.today();
  const todayDay = dayForWeekday(app.days, isoWeekday(today));
  const day = (dayId && app.days.find((d) => d.id === dayId)) || todayDay;

  const tabs = h('nav', { class: 'day-tabs', 'aria-label': 'Workout day' },
    app.days.map((d) => h('a', {
      class: `day-tab${d === day ? ' selected' : ''}${d === todayDay ? ' is-today' : ''}`,
      href: `#/today/${d.id}`,
      'aria-current': d === day ? 'page' : null,
    }, SHORT[d.weekday] ?? d.name.slice(0, 3))));

  const header = topBar(day ? day.name : 'Rest day');
  const sub = h('p', { class: 'subtitle muted' }, `${formatDate(today)}${day && day !== todayDay ? ' · not today’s plan' : ''}`);

  if (!day) {
    return [header, sub, tabs, emptyState(app.days.length ? 'No workout planned today. Pick a day above to train anyway.' : 'No plan yet. Add days in Settings.')];
  }
  if (!day.slots.length) return [header, sub, tabs, emptyState('This day has no exercises. Add some in Settings › Edit plan.')];

  const personId = app.activePerson.id;
  const isComplete = (s) => {
    const e = entriesForSlotOn(app.logs, personId, s.id, today);
    return e.length > 0 && e.every((x) => x.complete);
  };
  const doneCount = day.slots.filter(isComplete).length;
  const progress = h('p', { class: 'progress' }, doneCount === day.slots.length ? 'Workout done. Nice work!' : `${doneCount} of ${day.slots.length} done`);

  const cards = day.slots.map((slot, index) => {
    const ctx = { app, ui, day, slot, today, personId, index, isLast: index === day.slots.length - 1 };
    if (isComplete(slot)) return doneCard(ctx);
    return slot.kind === SlotKind.CIRCUIT ? circuitCard(ctx) : exerciseCard(ctx);
  });
  return [header, sub, tabs, progress, h('div', { class: 'cards' }, cards)];
}

// ---------- finished card ----------

function doneCard({ app, slot, today, personId }) {
  const entries = entriesForSlotOn(app.logs, personId, slot.id, today);
  return h('section', { class: 'card done', 'data-slot': slot.id },
    entries.map((e) => {
      const ex = app.exercise(e.exerciseId);
      return h('div', { class: 'done-row' },
        h('span', { class: 'check', 'aria-hidden': 'true' }, '✓'),
        h('a', { class: 'ex-name', href: `#/history/${ex.id}` }, ex.name),
        h('span', { class: 'done-perf' }, summarize(ex.measure, e.sets) || 'skipped'));
    }),
    h('div', { class: 'card-actions' },
      h('button', { class: 'btn-text', type: 'button', onclick: () => app.reopenSlot({ slotId: slot.id }) }, 'Change')));
}

// ---------- single exercise or rotation ----------

function exerciseCard(ctx) {
  const { app, ui, day, slot, today, personId, index, isLast } = ctx;
  const saved = entriesForSlotOn(app.logs, personId, slot.id, today);
  const started = saved.some((e) => e.sets.some((s) => s.done));
  const planned = nextExerciseId(slot, app.logs, personId, today);
  const chosen = saved[0]?.exerciseId ?? ui.swaps.get(slot.id) ?? planned;
  const ex = app.exercise(chosen);
  const last = lastPerformance(app.logs, personId, ex.id, today);
  const basis = last ?? (slot.kind === SlotKind.ROTATE
    ? lastInSlot(app.logs, personId, slot.id, today, (l) => app.exercise(l.exerciseId)?.measure === ex.measure)
    : null);

  const key = `${slot.id}:${ex.id}`;
  if (!ui.drafts.has(key)) {
    const fromSaved = saved.find((e) => e.exerciseId === ex.id);
    ui.drafts.set(key, fromSaved ? clone(fromSaved.sets)
      : planSets(ex.measure, basis?.sets, { warmup: index === 0 && app.warmupOn }));
  }
  let sets = ui.drafts.get(key);
  const setSets = (next) => { sets = next; ui.drafts.set(key, next); };

  const save = (complete) => app.saveSlot({ dayId: day.id, slotId: slot.id, entries: [{ exerciseId: ex.id, sets }], complete });
  const finish = async () => {
    if (!isLast) ui.timer.start(app.rest.work, 'Rest, then next exercise');
    else ui.timer.cancel();
    await save(true);
    ui.drafts.delete(key);
    ui.swaps.delete(slot.id);
  };

  const tick = (i) => guard(ui, slot.id, async () => {
    ui.timer.unlockAudio();
    const nowDone = !sets[i].done;
    setSets(sets.map((s, j) => (j === i ? { ...s, done: nowDone } : s)));
    if (nowDone && sets.every((s) => s.done)) return finish();
    // Start the timer before saving, so a quick later tap cannot be overtaken.
    if (nowDone) {
      const next = sets.findIndex((s) => !s.done);
      ui.timer.start(restAfter(sets, i, app.rest), next >= 0 ? `Next: ${setLabel(sets, next)}` : '');
    }
    await save(false);
  });

  // Working weight / hold time applies to every set not done yet.
  let main = null;
  if (ex.measure === Measure.WEIGHT) {
    const w = workSets(sets).find((s) => !s.done)?.weight ?? workSets(sets)[0]?.weight ?? 0;
    main = h('div', { class: 'main-control' },
      h('span', { class: 'main-label' }, 'Working weight'),
      stepper('weight', w, (v) => { setSets(withWorkingWeight(sets, v ?? 0)); ui.rerender(); }));
  } else if (ex.measure === Measure.TIME) {
    const t = workSets(sets).find((s) => !s.done)?.seconds ?? DEFAULT_SECONDS;
    main = h('div', { class: 'main-control' },
      h('span', { class: 'main-label' }, 'Hold'),
      stepper('seconds', t, (v) => { setSets(sets.map((s) => (s.done ? s : { ...s, seconds: v }))); ui.rerender(); }));
  }

  const rows = sets.map((s, i) => h('div', { class: `set-row${s.done ? ' is-done' : ''}${s.kind === SetKind.WARMUP ? ' warmup' : ''}` },
    h('span', { class: 'set-label' }, setLabel(sets, i)),
    setDetail(ex, s, (patch) => { setSets(sets.map((x, j) => (j === i ? { ...x, ...patch } : x))); }),
    h('button', {
      class: 'tick', type: 'button', 'aria-pressed': s.done ? 'true' : 'false',
      'aria-label': `${setLabel(sets, i)} ${s.done ? 'done, tap to undo' : 'mark done'}`, onclick: tick(i),
    }, '✓')));

  let rotation = null;
  if (slot.kind === SlotKind.ROTATE && slot.exerciseIds.length > 1) {
    const i = slot.exerciseIds.indexOf(chosen);
    const swap = () => {
      const next = slot.exerciseIds[(i + 1) % slot.exerciseIds.length];
      ui.drafts.delete(key);
      if (next === planned) ui.swaps.delete(slot.id); else ui.swaps.set(slot.id, next);
      ui.rerender();
    };
    rotation = h('div', { class: 'rotation' },
      h('span', { class: 'muted' }, `Variation ${i + 1} of ${slot.exerciseIds.length}${chosen === planned ? '' : ' (swapped)'}`),
      started ? null : h('button', { class: 'btn-text', type: 'button', onclick: swap }, 'Swap'));
  }

  return h('section', { class: 'card', 'data-slot': slot.id },
    rotation,
    h('div', { class: 'part-head' },
      h('a', { class: 'ex-name', href: `#/history/${ex.id}` }, ex.name),
      howToLink(ex)),
    lastLine(ex, last, today, basis && !last ? app.exercise(basis.exerciseId).name : null),
    main,
    h('div', { class: 'sets' }, rows),
    h('div', { class: 'card-actions' },
      h('button', { class: 'btn-text', type: 'button', onclick: () => { setSets(removeWorkSet(sets)); ui.rerender(); } }, '− Set'),
      h('button', { class: 'btn-text', type: 'button', onclick: () => { setSets(addWorkSet(sets)); ui.rerender(); } }, '+ Set'),
      h('span', { class: 'spacer' }),
      started ? h('button', { class: 'btn-text', type: 'button', onclick: finish }, 'Finish now') : null));
}

function setLabel(sets, i) {
  const s = sets[i];
  const n = sets.slice(0, i + 1).filter((x) => x.kind === s.kind).length;
  return s.kind === SetKind.WARMUP ? `Warm-up ${n}` : `Set ${n}`;
}

function setDetail(ex, s, onChange) {
  if (s.kind === SetKind.WARMUP) {
    return h('span', { class: 'set-detail' }, `${s.weight} lb × ${s.reps}`);
  }
  if (ex.measure === Measure.TIME) {
    return h('span', { class: 'set-detail' }, formatSeconds(s.seconds ?? DEFAULT_SECONDS));
  }
  return h('span', { class: 'set-detail' },
    stepper('reps', s.reps ?? DEFAULT_REPS, (v) => onChange({ reps: v }), { compact: true }),
    h('span', { class: 'muted unit' }, 'reps'));
}

// ---------- circuit (several exercises, several rounds) ----------

function circuitCard(ctx) {
  const { app, ui, day, slot, today, personId, isLast } = ctx;
  const saved = entriesForSlotOn(app.logs, personId, slot.id, today);
  const key = `${slot.id}:circuit`;

  if (!ui.drafts.has(key)) {
    const parts = {};
    let rounds = 0;
    let done = [];
    for (const exId of slot.exerciseIds) {
      const ex = app.exercise(exId);
      const s = saved.find((e) => e.exerciseId === exId);
      // Prefer last time in this circuit; the same exercise may appear in other circuits.
      const src = s ?? lastInSlot(app.logs, personId, slot.id, today, (l) => l.exerciseId === exId)
        ?? lastPerformance(app.logs, personId, exId, today);
      const first = src?.sets?.find((x) => x.kind === SetKind.WORK) ?? {};
      parts[exId] = {
        weight: ex.measure === Measure.WEIGHT ? (first.weight ?? 0) : null,
        reps: ex.measure === Measure.TIME ? null : (first.reps ?? DEFAULT_REPS),
        seconds: ex.measure === Measure.TIME ? (first.seconds ?? DEFAULT_SECONDS) : null,
      };
      rounds = Math.max(rounds, workSets(src?.sets).length);
      if (s && !done.length) done = s.sets.map((x) => x.done);
    }
    rounds = rounds || DEFAULT_WORK_SETS;
    ui.drafts.set(key, { parts, rounds, done: Array.from({ length: rounds }, (_, i) => Boolean(done[i])) });
  }
  const draft = ui.drafts.get(key);

  const entries = () => slot.exerciseIds.map((exerciseId) => ({
    exerciseId,
    sets: draft.done.map((d) => ({ kind: SetKind.WORK, ...draft.parts[exerciseId], done: d })),
  }));
  const save = (complete) => app.saveSlot({ dayId: day.id, slotId: slot.id, entries: entries(), complete });

  const tick = (i) => guard(ui, slot.id, async () => {
    ui.timer.unlockAudio();
    draft.done[i] = !draft.done[i];
    if (draft.done.every(Boolean)) {
      if (!isLast) ui.timer.start(app.rest.work, 'Rest, then next exercise'); else ui.timer.cancel();
      await save(true);
      ui.drafts.delete(key);
      return;
    }
    if (draft.done[i]) ui.timer.start(app.rest.circuit, `Next: round ${draft.done.indexOf(false) + 1}`);
    await save(false);
  });

  const parts = slot.exerciseIds.map((exId) => {
    const ex = app.exercise(exId);
    const v = draft.parts[exId];
    const last = lastInSlot(app.logs, personId, slot.id, today, (l) => l.exerciseId === exId)
      ?? lastPerformance(app.logs, personId, exId, today);
    const controls = [];
    if (ex.measure === Measure.WEIGHT) controls.push(stepper('weight', v.weight, (x) => { v.weight = x; }));
    if (ex.measure !== Measure.TIME) controls.push(stepper('reps', v.reps, (x) => { v.reps = x; }));
    if (ex.measure === Measure.TIME) controls.push(stepper('seconds', v.seconds, (x) => { v.seconds = x; }));
    return h('div', { class: 'part' },
      h('div', { class: 'part-head' }, h('a', { class: 'ex-name small-name', href: `#/history/${ex.id}` }, ex.name), howToLink(ex)),
      lastLine(ex, last, today),
      h('div', { class: 'steppers' }, controls));
  });

  const rounds = draft.done.map((d, i) => h('div', { class: `set-row${d ? ' is-done' : ''}` },
    h('span', { class: 'set-label' }, `Round ${i + 1}`),
    h('span', { class: 'set-detail muted' }, 'all exercises above'),
    h('button', { class: 'tick', type: 'button', 'aria-pressed': d ? 'true' : 'false', 'aria-label': `Round ${i + 1} ${d ? 'done, tap to undo' : 'mark done'}`, onclick: tick(i) }, '✓')));

  const changeRounds = (delta) => {
    const n = Math.max(1, draft.rounds + delta);
    if (delta < 0 && draft.done[n]) return;
    draft.rounds = n;
    draft.done = Array.from({ length: n }, (_, i) => Boolean(draft.done[i]));
    ui.rerender();
  };

  return h('section', { class: 'card', 'data-slot': slot.id },
    h('p', { class: 'kind-label muted' }, 'Circuit'),
    parts,
    h('div', { class: 'sets' }, rounds),
    h('div', { class: 'card-actions' },
      h('button', { class: 'btn-text', type: 'button', onclick: () => changeRounds(-1) }, '− Round'),
      h('button', { class: 'btn-text', type: 'button', onclick: () => changeRounds(1) }, '+ Round'),
      h('span', { class: 'spacer' }),
      draft.done.some(Boolean) ? h('button', { class: 'btn-text', type: 'button', onclick: async () => { await save(true); ui.drafts.delete(key); } }, 'Finish now') : null));
}

/** Ignore taps on a card while its last tap is still being saved (stops double taps undoing a set). */
function guard(ui, slotId, fn) {
  return async () => {
    if (ui.busy.has(slotId)) return;
    ui.busy.add(slotId);
    try { await fn(); } finally { ui.busy.delete(slotId); }
  };
}
