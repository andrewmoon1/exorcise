// App entry: open storage, build the app service, route and render.

import { openIdbStore, requestPersistence } from './storage/idb-store.js';
import { createMemoryStore } from './storage/memory-store.js';
import { createAppService } from './actions/app-service.js';
import { seedSnapshot } from './seed/seed-data.js';
import { h } from './ui/dom.js';
import { createRestTimer } from './ui/rest-timer.js';
import { renderToday } from './ui/today-view.js';
import { renderHistoryList, renderHistoryDetail } from './ui/history-view.js';
import { renderSettings, renderPlanDay, renderExerciseEdit } from './ui/settings-view.js';

const VERSION = '0.4.0';

const routes = [
  [/^#\/today(?:\/([\w-]+))?$/, 'today', renderToday],
  [/^#\/history$/, 'history', renderHistoryList],
  [/^#\/history\/([\w-]+)$/, 'history', renderHistoryDetail],
  [/^#\/settings$/, 'settings', renderSettings],
  [/^#\/plan\/([\w-]+)$/, 'settings', renderPlanDay],
  [/^#\/exercise\/([\w-]+)$/, 'settings', renderExerciseEdit],
];

async function openStore() {
  try {
    const store = await openIdbStore();
    requestPersistence();
    return store;
  } catch (err) {
    console.warn('IndexedDB unavailable, data will not be saved', err);
    return createMemoryStore();
  }
}

async function start() {
  const app = await createAppService(await openStore(), { seed: seedSnapshot });
  const view = document.getElementById('view');
  const nav = document.getElementById('nav');
  const toastEl = document.getElementById('toast');

  const ui = {
    version: VERSION,
    drafts: new Map(), // sets being worked on, per slot and exercise
    swaps: new Map(),  // variation picked by hand for a slot today
    busy: new Set(),   // slots with a save in progress
    historyQuery: '',
    timer: createRestTimer(document.getElementById('timer')),
    rerender: () => render(),
    toast(text) {
      toastEl.textContent = text;
      toastEl.hidden = false;
      clearTimeout(toastEl._t);
      toastEl._t = setTimeout(() => { toastEl.hidden = true; }, 2500);
    },
  };

  let lastDate = app.today();
  function render() {
    if (app.today() !== lastDate) { lastDate = app.today(); ui.drafts.clear(); ui.swaps.clear(); }
    const hash = location.hash || '#/today';
    const match = routes.map(([re, tab, fn]) => [hash.match(re), tab, fn]).find(([m]) => m);
    const [m, tab, fn] = match ?? [[], 'today', renderToday];
    const y = window.scrollY;
    view.replaceChildren(...[fn(app, ui, m[1])].flat());
    window.scrollTo(0, view.dataset.route === hash ? y : 0);
    view.dataset.route = hash;
    for (const a of nav.querySelectorAll('a')) a.classList.toggle('selected', a.dataset.tab === tab);
  }

  app.subscribe(render);
  window.addEventListener('hashchange', render);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  render();
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // When a new version takes over, reload once so the screen uses it.
  // Ticked sets are already saved, so nothing is lost.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch((err) => console.warn('Service worker failed', err));
}

start().catch((err) => {
  console.error(err);
  document.getElementById('view').replaceChildren(h('p', { class: 'error' }, `The app could not start: ${err.message}`));
});
