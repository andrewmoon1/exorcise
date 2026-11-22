// In-memory store. Used by tests, and as a fallback when IndexedDB is missing.

import { Collections } from '../domain/model.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

export function createMemoryStore(initial = {}) {
  const data = new Map(Collections.map((c) => [c, new Map()]));
  for (const [c, recs] of Object.entries(initial)) for (const r of recs) data.get(c).set(r.id, clone(r));
  const col = (c) => {
    const m = data.get(c);
    if (!m) throw new Error(`Unknown collection: ${c}`);
    return m;
  };
  return {
    kind: 'memory',
    async getAll(c) { return [...col(c).values()].map(clone); },
    async put(c, r) { col(c).set(r.id, clone(r)); },
    async putMany(c, rs) { for (const r of rs) col(c).set(r.id, clone(r)); },
    async delete(c, id) { col(c).delete(id); },
    async deleteMany(c, ids) { for (const id of ids) col(c).delete(id); },
    async replaceAll(all) {
      for (const c of Collections) {
        col(c).clear();
        for (const r of all[c] ?? []) col(c).set(r.id, clone(r));
      }
    },
  };
}
