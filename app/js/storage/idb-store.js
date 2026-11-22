// IndexedDB store: data stays on the device and works offline.

import { Collections } from '../domain/model.js';

const DB_VERSION = 1; // IndexedDB structure version (object stores), not the data schema.

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function openIdbStore(name = 'exorcise', idb = globalThis.indexedDB) {
  const open = idb.open(name, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    for (const c of Collections) {
      if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' });
    }
  };
  const db = await req(open);

  function write(names, fn) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      fn(tx);
    });
  }

  return {
    kind: 'indexeddb',
    async getAll(c) {
      return req(db.transaction(c, 'readonly').objectStore(c).getAll());
    },
    put(c, r) { return write(c, (tx) => tx.objectStore(c).put(r)); },
    putMany(c, rs) { return write(c, (tx) => { const s = tx.objectStore(c); for (const r of rs) s.put(r); }); },
    delete(c, id) { return write(c, (tx) => tx.objectStore(c).delete(id)); },
    deleteMany(c, ids) { return write(c, (tx) => { const s = tx.objectStore(c); for (const id of ids) s.delete(id); }); },
    replaceAll(all) {
      return write([...Collections], (tx) => {
        for (const c of Collections) {
          const s = tx.objectStore(c);
          s.clear();
          for (const r of all[c] ?? []) s.put(r);
        }
      });
    },
  };
}

/** Ask the browser not to clear this app's data when space is low. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
    return true;
  } catch {
    return false;
  }
}
