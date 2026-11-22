// Settings: person, plan editing, backup and restore.

import { h } from './dom.js';
import { topBar, stepper } from './components.js';
import { Measure, SlotKind } from '../domain/model.js';

export function renderSettings(app, ui) {
  const restRows = [
    ['warmup1', 'After warm-up 1'],
    ['warmup2', 'After warm-up 2'],
    ['warmup3', 'After warm-up 3'],
    ['work', 'Between working sets and exercises'],
    ['circuit', 'Between circuit rounds'],
  ].map(([k, label]) => h('div', { class: 'list-row' },
    h('span', {}, label),
    stepper('seconds', app.rest[k], (v) => app.setRest(k, v), { ariaLabel: `${label}, seconds` })));

  const training = h('div', { class: 'card' },
    h('h2', {}, 'Warm-up and rest'),
    h('label', { class: 'toggle-row' },
      h('span', {}, 'Warm-up sets before the first exercise', h('br'),
        h('span', { class: 'muted small' }, '12 reps at 50%, 10 reps at 50%, 7 reps at 70% of working weight')),
      h('input', { type: 'checkbox', checked: app.warmupOn, onchange: (e) => app.setWarmup(e.target.checked) })),
    h('p', { class: 'muted small' }, 'Rest times in seconds'),
    h('div', { class: 'list' }, restRows));

  const plan = h('div', { class: 'card' },
    h('h2', {}, 'Edit plan'),
    h('ul', { class: 'list' }, app.days.map((d) => h('li', {},
      h('a', { class: 'list-row', href: `#/plan/${d.id}` },
        h('span', {}, d.name), h('span', { class: 'muted' }, `${d.slots.length} exercises ›`))))));

  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const backup = JSON.parse(await file.text());
        if (!confirm('Restore this backup? It replaces all data on this device.')) return;
        await app.importBackup(backup);
        ui.toast('Backup restored');
      } catch (err) {
        ui.toast(`Restore failed: ${err.message}`);
      } finally {
        e.target.value = '';
      }
    },
  });

  const backup = h('div', { class: 'card' },
    h('h2', {}, 'Backup'),
    h('p', { class: 'muted' }, 'Your data is stored only on this device. Save a backup file now and then, for example to iCloud Drive.'),
    h('div', { class: 'button-row' },
      h('button', { class: 'btn-secondary', type: 'button', onclick: () => downloadBackup(app) }, 'Save backup'),
      h('button', { class: 'btn-secondary', type: 'button', onclick: () => fileInput.click() }, 'Restore backup')),
    fileInput);

  const about = h('p', { class: 'muted small' }, `Exorcise ${ui.version} · storage: ${app.storeKind}`);
  return [topBar('Settings'), training, plan, backup, about];
}

function downloadBackup(app) {
  const json = JSON.stringify(app.exportBackup(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `exorcise-backup-${app.today()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** A text box with an Add button. */
function inlineAdd(buttonText, placeholder, onAdd, listId) {
  const input = h('input', { type: 'text', placeholder, 'aria-label': placeholder, list: listId ?? null, autocapitalize: 'words' });
  const submit = async (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    await onAdd(v);
    input.value = '';
  };
  return h('form', { class: 'inline-add', onsubmit: submit }, input, h('button', { class: 'btn-secondary', type: 'submit' }, buttonText));
}

export function renderPlanDay(app, ui, dayId) {
  const day = app.days.find((d) => d.id === dayId);
  if (!day) return [topBar('Edit plan', { back: '#/settings' }), h('p', {}, 'Day not found.')];
  const listId = 'exercise-names';
  const names = h('datalist', { id: listId }, app.exercises.map((e) => h('option', { value: e.name })));

  const slots = day.slots.map((slot, i) => {
    const kindChoice = slot.exerciseIds.length > 1
      ? h('div', { class: 'choices small' },
        [[SlotKind.ROTATE, 'Rotate'], [SlotKind.CIRCUIT, 'Circuit']].map(([k, label]) => h('button', {
          class: `choice${slot.kind === k ? ' selected' : ''}`, type: 'button',
          'aria-pressed': slot.kind === k ? 'true' : 'false',
          onclick: () => app.setSlotKind(day.id, slot.id, k),
        }, label)),
        h('span', { class: 'muted small kind-help' }, slot.kind === SlotKind.CIRCUIT ? 'All done together' : 'One per workout, in turn'))
      : null;
    return h('section', { class: 'card' },
      h('div', { class: 'slot-head' },
        h('span', { class: 'muted' }, `#${i + 1}`),
        h('span', { class: 'spacer' }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => app.moveSlot(day.id, slot.id, -1) }, '↑'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move down', disabled: i === day.slots.length - 1, onclick: () => app.moveSlot(day.id, slot.id, 1) }, '↓'),
        h('button', {
          class: 'icon-btn', type: 'button', 'aria-label': 'Remove from day',
          onclick: () => { if (confirm('Remove this from the plan? History is kept.')) app.removeSlot(day.id, slot.id); },
        }, '✕')),
      kindChoice,
      h('ul', { class: 'list' }, slot.exerciseIds.map((id) => {
        const ex = app.exercise(id);
        return h('li', { class: 'list-row' },
          h('a', { href: `#/exercise/${id}` }, ex?.name ?? id),
          slot.exerciseIds.length > 1
            ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Remove ${ex?.name}`, onclick: () => app.removeFromSlot(day.id, slot.id, id) }, '✕')
            : null);
      })),
      inlineAdd('Add', 'Add a variation', (name) => app.addToSlot(day.id, slot.id, name), listId));
  });

  return [
    topBar(day.name, { back: '#/settings' }),
    h('p', { class: 'subtitle muted' }, 'Tap an exercise to rename it or set its how-to link.'),
    names,
    h('div', { class: 'cards' }, slots),
    h('div', { class: 'card' }, h('h2', {}, 'Add an exercise'), inlineAdd('Add', 'Exercise name', (name) => app.addSlot(day.id, name), listId)),
  ];
}

export function renderExerciseEdit(app, ui, exerciseId) {
  const ex = app.exercise(exerciseId);
  if (!ex) return [topBar('Exercise', { back: '#/settings' }), h('p', {}, 'Exercise not found.')];
  const name = h('input', { type: 'text', value: ex.name, 'aria-label': 'Name', required: true });
  const link = h('input', { type: 'url', value: ex.link ?? '', placeholder: 'https://…', 'aria-label': 'How-to link' });
  const measure = h('select', { 'aria-label': 'Measured by' },
    [[Measure.WEIGHT, 'Weight, reps and sets'], [Measure.REPS, 'Reps and sets (no weight)'], [Measure.TIME, 'Time and sets']]
      .map(([v, label]) => h('option', { value: v, selected: ex.measure === v }, label)));
  const save = async (e) => {
    e.preventDefault();
    await app.updateExercise(ex.id, { name: name.value, link: link.value.trim(), measure: measure.value });
    ui.toast('Saved');
    history.back();
  };
  return [
    topBar('Edit exercise', { back: `#/history/${ex.id}` }),
    h('form', { class: 'card form', onsubmit: save },
      h('label', {}, 'Name', name),
      h('label', {}, 'How-to link', link),
      h('label', {}, 'Measured by', measure),
      h('button', { class: 'btn-primary', type: 'submit' }, 'Save')),
  ];
}
