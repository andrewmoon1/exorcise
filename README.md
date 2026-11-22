# Exorcise

A simple offline workout tracker. It replaces `data/exercise-routine.xlsx`
(which the app never changes) with a phone app that:

- opens on today's workout,
- fills in last time's weight, reps and sets, so a normal set is one tap on **Done**,
- keeps every workout as history instead of overwriting it,
- rotates exercise variations automatically (for example Deadlift → Romanian Deadlift → Single Leg Deadlift),
- works with no internet, and keeps all data on the device.

## Run it on your Mac

```sh
cd exorcise
python3 -m http.server 8080 --directory app   # or: npm start
```

Open http://localhost:8080. To try it as a phone, use the browser's device mode.

## Put it on your phone

A phone can only install the app from a secure (https) address. The `app/`
folder is a static site, so any static host works, for example GitHub Pages
(publish the `app/` folder). Open the address on the phone, then
**Share › Add to Home Screen** (iPhone) or **Install app** (Android). After the
first visit it works offline.

Data stays on the phone. Use **Settings › Save backup** now and then.

## Tests

```sh
node --test tests/*.test.js   # or: npm test
```

## How the code is organised

Each layer only calls the layer below it.

| Folder | Job |
| --- | --- |
| `app/js/ui/` | Screens. Draw cards and buttons, react to taps. |
| `app/js/actions/` | One function per user action (log a workout, edit the plan, backup). |
| `app/js/domain/` | Pure rules with no storage or screen code: "last time", next variation, input checks. |
| `app/js/storage/` | Save and read records. `idb-store.js` (IndexedDB) and `memory-store.js` share one interface (`store.js`). |
| `app/js/seed/` | Starting data copied from the spreadsheet, used on first start only. |

Data model: the **plan** (`days` holding ordered `slots`; a slot holds one
exercise, a rotation of variations, or a circuit) and the **history** (`logs`,
one record per exercise per workout, never overwritten). "Last time" and "next
variation" are calculated from history, not stored.

### Extending

- **New data field:** bump `SCHEMA_VERSION` in `domain/model.js` and add a
  migration in `storage/migrations.js`. Old backups are upgraded on restore.
- **Cloud sync:** add a store that implements the interface in `storage/store.js`.
- **New screen:** add a render function in `ui/` and a route in `main.js`.
- **Releasing a change:** bump `CACHE` in `app/sw.js` (and add any new file to
  `FILES`) so installed phones fetch the new version.
