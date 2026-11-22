// Pure helpers for the plan (days and their slots).

import { SlotKind } from './model.js';

/** The plan day for a date: the day whose weekday matches, or null. */
export function dayForWeekday(days, weekday) {
  return days.find((d) => d.weekday === weekday) ?? null;
}

export function sortDays(days) {
  return [...days].sort((a, b) => (a.weekday ?? 99) - (b.weekday ?? 99) || a.name.localeCompare(b.name));
}

/** Slot kind that fits a list of exercises when the user adds or removes one. */
export function kindAfterChange(currentKind, count) {
  if (count <= 1) return SlotKind.SINGLE;
  if (currentKind === SlotKind.SINGLE) return SlotKind.ROTATE;
  return currentKind;
}

/** Move an item in an array by `delta`, returning a new array. */
export function moveItem(list, index, delta) {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const out = [...list];
  const [item] = out.splice(index, 1);
  out.splice(to, 0, item);
  return out;
}
