// Dates are stored as local calendar days: "YYYY-MM-DD".

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(iso) {
  const js = parseISODate(iso).getDay();
  return js === 0 ? 7 : js;
}

export function daysBetween(fromIso, toIso) {
  const ms = parseISODate(toIso) - parseISODate(fromIso);
  return Math.round(ms / 86400000);
}

/** "21 Jul 2026", or "21 Jul" when in the same year as `todayIso`. */
export function formatDate(iso, todayIso) {
  const [y, m, d] = iso.split('-').map(Number);
  const sameYear = todayIso && Number(todayIso.slice(0, 4)) === y;
  return `${d} ${MONTHS[m - 1]}${sameYear ? '' : ` ${y}`}`;
}

/** "today", "yesterday", "5 days ago", "3 weeks ago", "4 months ago". */
export function formatAgo(iso, todayIso) {
  const n = daysBetween(iso, todayIso);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 14) return `${n} days ago`;
  if (n < 60) return `${Math.round(n / 7)} weeks ago`;
  if (n < 730) return `${Math.round(n / 30)} months ago`;
  return `${Math.round(n / 365)} years ago`;
}
