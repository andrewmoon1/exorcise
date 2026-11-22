// The storage interface every store must implement.
//
//   getAll(collection)          -> Promise<record[]>
//   put(collection, record)     -> Promise<void>
//   putMany(collection, records)-> Promise<void>
//   delete(collection, id)      -> Promise<void>
//   deleteMany(collection, ids) -> Promise<void>
//   replaceAll({ [collection]: record[] }) -> Promise<void>  (atomic restore)
//
// Records are plain JSON objects with a string `id`. The rest of the app
// only talks to this interface, so a cloud-sync store can be added later
// without changing the rules or the screens.

export { Collections } from '../domain/model.js';
