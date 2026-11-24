// Data migrations. Each entry upgrades the stored data by one schema version.
// To change the data shape later: bump SCHEMA_VERSION in domain/model.js and
// add a function here keyed by the new version number.

import { SCHEMA_VERSION } from '../domain/model.js';
import { addVariations } from '../seed/dumbbell-variations.js';
import { addOldHistory } from '../seed/old-history.js';

/** @type {Record<number, (data: Record<string, any[]>) => Record<string, any[]>>} */
export const migrations = {
  // v2: add a dumbbell variation to exercises that had none.
  2: (data) => addVariations(data),
  // v3: add the history from the older workout sheet (2022 to 2025).
  3: (data) => addOldHistory(data),
};

/** Upgrade a full data snapshot (as used for backups) to the current version. */
export function migrateSnapshot(data, fromVersion) {
  if (fromVersion > SCHEMA_VERSION) {
    throw new Error(`This backup is from a newer app version (${fromVersion}). Update the app first.`);
  }
  let out = data;
  for (let v = fromVersion + 1; v <= SCHEMA_VERSION; v++) {
    if (migrations[v]) out = migrations[v](out);
  }
  return out;
}
