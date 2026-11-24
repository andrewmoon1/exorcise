"""Turn data/Workouts.xlsx (the older workout sheet, 2022 to 2025) into
app/js/seed/workouts-history.js.

Each tab of the sheet holds the latest numbers for each exercise at the time
the tab was used. Old values were overwritten, so the file has one entry per
exercise per tab. Across the six tabs the same exercise often appears with
different dates, and each (exercise, date) pair becomes one history entry.

Run:  python3 tools/import_workouts.py
Needs: openpyxl
"""

import datetime as dt
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'Workouts.xlsx'
OUT = ROOT / 'app' / 'js' / 'seed' / 'workouts-history.js'

# Sheet name (lower case, single spaces) -> exercise name in the app.
# Spelling variants of the same exercise share one name.
# Names that match an exercise already in the app reuse it.
NAMES = {
    'deadlift': 'Deadlift',
    'bench press': 'Bench Press',
    'incline bench': 'Incline Bench Press',
    'military press': 'Military Press',
    'bent over rear delt raise': 'Bent Over Rear Delt Raise',
    'dumbell curl': 'Dumbbell Curl',
    'side lateral raise': 'Side Lat Raise',
    'bicycle crunch': 'Bicycle Crunch',
    'shoulder shrugs barbell': 'Shoulder Shrugs',
    'back extension': 'Back Extension',
    'back extensions': 'Back Extension',
    'calf raise': 'Calf Raise',
    'calf raises': 'Calf Raise',
    'calf raise (machine)': 'Calf Raise Machine',
    'calf raise (seated)': 'Seated Calf Raise',
    'seated calf raise': 'Seated Calf Raise',
    "captain's chair abs": "Captain's Chair Abs",
    'captains chair abs': "Captain's Chair Abs",
    'captains chair': "Captain's Chair Abs",
    'captains chair leg lifts': "Captain's Chair Leg Raise",
    'captains chair leg raise': "Captain's Chair Leg Raise",
    'captains chair tricep dips': 'Tricep Dips',
    'tricep dips': 'Tricep Dips',
    'chest flys': 'Chest Fly',
    'chest flys (machine)': 'Chest Fly',
    'pectoral fly machine': 'Chest Fly',
    'dumbbell chest flys': 'Dumbbell Chest Fly',
    'chest flys (dumbell wit': 'Dumbbell Chest Fly',
    'chest press machine': 'Chest Press Machine',
    'chest press': 'Chest Press',
    'dumbell chest press': 'Dumbbell Chest Press',
    'deadlift (bar)': 'Deadlift (bar)',
    'deadlift (smith machine)': 'Smith Machine Deadlift',
    'deadlift smith machine': 'Smith Machine Deadlift',
    'squat': 'Squat',
    'squat (smith machine)': 'Smith Machine Squat',
    'hip abduction': 'Hip Abductor Machine',
    'hip abductor machine': 'Hip Abductor Machine',
    'hip abductors': 'Hip Abductor Machine',
    'hip adduction': 'Hip Adduction',
    'hip adduction machine': 'Hip Adduction',
    'leg curl': 'Leg Curl',
    'leg curl (broke machine)': 'Leg Curl',
    'leg curl pt gradient': 'Leg Curl PT Gradient',
    'leg extension': 'Leg Extension',
    'leg extensions': 'Leg Extension',
    'leg extension 2sided machine': 'Leg Extension',
    'low row': 'Low Row',
    'low row machine': 'Low Row',
    'lower back exercise': 'Lower Back Extension',
    'lower back exercises': 'Lower Back Extension',
    'lower back extension machine': 'Lower Back Extension',
    'upper back extension': 'Upper Back Extension',
    'upper back extension machine': 'Upper Back Extension',
    'military press (dumbbell)': 'Dumbbell Military Press',
    'rear delt fly machine': 'Rear Delt Machine',
    'rear deltoid fly machine': 'Rear Delt Machine',
    'rear delt machine': 'Rear Delt Machine',
    'side lateral raise (machine)': 'Lateral Raise Machine',
    'lateral raise (machine)': 'Lateral Raise Machine',
    'torso rotation': 'Torso Rotation',
    'torso rotation machine': 'Torso Rotation',
    'cable rows': 'Cable Row',
    'cable row': 'Cable Row',
    'cable rows (split machine)': 'Cable Row',
    'wide grip pull-down': 'Lat Pull-down',
    'lat pull down': 'Lat Pull-down',
    'tricep pull-down cable': 'Tricep Cable Pushdown',
    'tricep extension pulley': 'Tricep Cable Pushdown',
    'row machine (by squat racks)': 'Row Machine (by squat racks)',
    'mts high row': 'MTS High Row',
}

# Rows that are labels, not exercises.
SKIP = {'shoulder injury', 'hip flexors'}

# Existing app exercise ids, so imported history joins the app's own history.
APP_IDS = {
    'Deadlift': 'deadlift', 'Bench Press': 'bench-press', 'Incline Bench Press': 'incline-bench-press',
    'Military Press': 'military-press', 'Bent Over Rear Delt Raise': 'bent-over-rear-delt-raise',
    'Dumbbell Curl': 'dumbbell-curl', 'Side Lat Raise': 'side-lat-raise', 'Bicycle Crunch': 'bicycle-crunch',
    'Shoulder Shrugs': 'shoulder-shrugs',
}


def clean_name(raw):
    key = re.sub(r'\s+', ' ', str(raw).strip()).lower()
    if key in SKIP:
        return None
    if key in NAMES:
        return NAMES[key]
    return ' '.join(w[:1].upper() + w[1:] for w in key.split(' '))


def slug(name):
    s = name.lower().replace("'", '')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def first_number(v):
    """Number, or the first number in text such as '90 or 40'. Dates and other values give None."""
    if isinstance(v, bool) or isinstance(v, (dt.date, dt.datetime)):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        m = re.match(r'\s*(\d+(?:\.\d+)?)', v)
        return float(m.group(1)) if m else None
    return None


def num(v):
    return int(v) if v is not None and float(v).is_integer() else v


def main():
    wb = openpyxl.load_workbook(SRC)
    entries = {}
    problems = []
    for ws in wb:
        for row in ws.iter_rows(min_row=2, values_only=True):
            name_raw, weight_raw, reps_raw, sets_raw, date_raw = (list(row) + [None] * 5)[:5]
            if not name_raw:
                continue
            name = clean_name(name_raw)
            if not name or not isinstance(date_raw, dt.datetime):
                continue
            notes = []
            weight = first_number(weight_raw)
            if isinstance(weight_raw, str):
                notes.append(f'weight: {weight_raw.strip()}')
            reps = first_number(reps_raw) if not isinstance(reps_raw, str) else None
            if isinstance(reps_raw, str):
                notes.append(f'reps: {reps_raw.strip()}')
            sets = first_number(sets_raw)
            # Ab rows in the "Esporta" tab have reps and sets the other way round (3 reps × 12 sets).
            if reps == 3 and sets == 12:
                reps, sets = sets, reps
            if reps is not None and reps > 50:
                problems.append(f'{ws.title}: {name} reps {reps} looks like a typo, left out')
                reps = None
            if sets is None or not (1 <= sets <= 12):
                if sets is not None:
                    problems.append(f'{ws.title}: {name} sets {sets} looks like a typo, used 3')
                sets = 3
            if weight == 0:
                weight = None
            date = date_raw.date().isoformat()
            ex_id = APP_IDS.get(name, slug(name))
            key = (ex_id, date)
            rec = {'name': name, 'w': num(weight), 'r': num(reps), 's': int(sets), 'note': '; '.join(notes)}
            if key in entries:
                old = entries[key]
                if (old['w'], old['r'], old['s']) != (rec['w'], rec['r'], rec['s']):
                    problems.append(f'{ws.title}: {name} {date} differs from another tab, kept the first')
                continue
            entries[key] = rec

    exercises = {}
    for (ex_id, _), rec in entries.items():
        e = exercises.setdefault(ex_id, {'id': ex_id, 'name': rec['name'], 'weighted': False})
        e['weighted'] |= rec['w'] is not None

    ex_rows = [
        {'id': e['id'], 'name': e['name'], 'measure': 'weight' if e['weighted'] else 'reps'}
        for e in sorted(exercises.values(), key=lambda x: x['name'])
        if e['id'] not in APP_IDS.values()
    ]
    log_rows = []
    for (ex_id, date), r in sorted(entries.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        row = [date, ex_id, r['w'], r['r'], r['s']]
        if r['note']:
            row.append(r['note'])
        log_rows.append(row)

    js = [
        '// Generated by tools/import_workouts.py from data/Workouts.xlsx. Do not edit by hand.',
        '// History from the older workout sheet (2022 to 2025): one row per exercise per date.',
        '// Row: [date, exerciseId, weight lb, reps, sets, note?]',
        '',
        'export const OLD_EXERCISES = Object.freeze(' + json.dumps(ex_rows, indent=2) + ');',
        '',
        'export const OLD_LOGS = Object.freeze([',
        *[f'  {json.dumps(r)},' for r in log_rows],
        ']);',
        '',
    ]
    OUT.write_text('\n'.join(js))
    dates = sorted({d for (_, d) in entries})
    print(f'{len(log_rows)} entries, {len(exercises)} exercises ({len(ex_rows)} new), {len(dates)} dates, {dates[0]} to {dates[-1]}')
    for p in problems:
        print('  note:', p, file=sys.stderr)


if __name__ == '__main__':
    main()
