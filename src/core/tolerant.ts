/**
 * Reading values a source file never bothered to format.
 *
 * Real exports are not tidy: a list arrives as `a, b, c` rather than JSON, and a
 * timestamp arrives in whatever shape the system that wrote it preferred. These
 * helpers guess, conservatively, so that a cell which would otherwise be a hard
 * coercion error becomes readable data.
 *
 * Kept out of `coercion.ts` because the renderer needs {@link hasTimeOfDay} and
 * should not have to pull in the coercion dispatcher to get it.
 */

const CLOSERS: Record<string, string> = { "[": "]", "(": ")", "{": "}" };
const SEPARATORS = /[,;|\r\n]/;

/** Strip one matched pair of quotes, if the piece is wrapped in them. */
function unquote(piece: string): string {
  const s = piece.trim();
  const first = s[0];
  if (s.length >= 2 && (first === '"' || first === "'") && s.endsWith(first)) {
    return s.slice(1, -1).trim();
  }
  return s;
}

/**
 * Split a stringy list into its items.
 *
 * Deliberately forgiving in one direction only: it never merges items and never
 * invents them. Anything it cannot make sense of comes back as a single item,
 * which is exactly what the caller would have had otherwise.
 */
export function splitList(raw: string): string[] {
  let s = raw.trim();
  const closer = CLOSERS[s[0] ?? ""];
  // One layer only, and only when the pair actually matches — `[a, b` is far
  // more likely to be a truncated cell than a list that wants its bracket eaten.
  if (closer !== undefined && s.length >= 2 && s.endsWith(closer)) s = s.slice(1, -1).trim();

  return s
    .split(SEPARATORS)
    .map(unquote)
    .filter((piece) => piece !== "");
}

interface Ymd {
  y: number;
  m: number;
  d: number;
}

/**
 * Date shapes carrying no time of day.
 *
 * Nothing here overlaps: the compact form is eight digits, the epoch form is at
 * least nine, and the bare year is four.
 */
const DATE_ONLY: readonly { re: RegExp; take: (m: RegExpMatchArray) => Ymd }[] = [
  {
    re: /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/,
    take: (m) => ({ y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }),
  },
  {
    re: /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/,
    // Day-first when the first component cannot be a month. Otherwise month-first,
    // matching what `new Date("01/05/2026")` has always done — flipping that
    // default would silently re-date every file already labeled with this app.
    take: (m) => {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const y = Number(m[3]);
      return a > 12 ? { y, m: b, d: a } : { y, m: a, d: b };
    },
  },
  {
    re: /^(\d{4})(\d{2})(\d{2})$/,
    take: (m) => ({ y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }),
  },
  { re: /^(\d{4})$/, take: (m) => ({ y: Number(m[1]), m: 1, d: 1 }) },
];

/** Build a UTC instant, rejecting components that rolled over (`2026-13-45`). */
function utcFrom({ y, m, d }: Ymd, hh = 0, mi = 0, ss = 0, ms = 0): Date | undefined {
  const date = new Date(Date.UTC(y, m - 1, d, hh, mi, ss, ms));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return undefined;
  }
  return date;
}

function matchDateOnly(s: string): Ymd | undefined {
  for (const { re, take } of DATE_ONLY) {
    const m = s.match(re);
    if (m) return take(m);
  }
  return undefined;
}

const EPOCH = /^-?\d{9,14}$/;
/** Below this, an epoch number has to be seconds — it is year ~5138 in millis. */
const SECONDS_CEILING = 1e11;

const HAS_TIME = /\d{1,2}:\d{2}/;
const WITH_TIME = /^(.+?)[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
const OFFSET = /^([+-])(\d{2}):?(\d{2})$/;

function parseWithTime(s: string): Date | undefined {
  const m = s.match(WITH_TIME);
  if (!m) return undefined;
  const ymd = matchDateOnly((m[1] ?? "").trim());
  if (!ymd) return undefined;

  const hh = Number(m[2]);
  const mi = Number(m[3]);
  const ss = m[4] === undefined ? 0 : Number(m[4]);
  const ms = m[5] === undefined ? 0 : Math.round(Number(m[5]) * 1000);
  if (hh > 23 || mi > 59 || ss > 59) return undefined;

  const base = utcFrom(ymd, hh, mi, ss, ms);
  const zone = m[6];
  if (base === undefined || zone === undefined) return base;
  if (zone.toLowerCase() === "z") return base;

  const offset = zone.match(OFFSET);
  if (!offset) return undefined;
  const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === "-" ? -1 : 1);
  return new Date(base.getTime() - minutes * 60_000);
}

/**
 * Parse a date in any of the shapes a spreadsheet or an export script plausibly
 * emits. `undefined` when it is not a date at all.
 *
 * **Everything is read as UTC, including values that name no zone.** That is the
 * decision the rest of the date handling rests on:
 *
 * - it keeps {@link hasTimeOfDay} exact. Read as local time, `2026-05-01 17:00`
 *   lands on precisely UTC midnight for a labeler in California, and the time
 *   would vanish from the screen — the bug this is all here to prevent;
 * - it makes exports deterministic. Reading zone-less input as local time means
 *   two labelers in two timezones write different bytes for identical input;
 * - a source that named no zone has not told us one, and inventing the reader's
 *   is a guess dressed up as data.
 */
export function parseDateish(raw: string): Date | undefined {
  const s = raw.trim();
  if (s === "") return undefined;

  if (EPOCH.test(s)) {
    const n = Number(s);
    const date = new Date(Math.abs(n) <= SECONDS_CEILING ? n * 1000 : n);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const dateOnly = matchDateOnly(s);
  if (dateOnly) return utcFrom(dateOnly);

  if (HAS_TIME.test(s)) {
    const structured = parseWithTime(s);
    if (structured) return structured;
    // A time we could not take apart. Better to hand back whatever the engine
    // makes of it than to snap it to midnight and lose the time silently.
    const loose = new Date(s);
    return Number.isNaN(loose.getTime()) ? undefined : loose;
  }

  // An unrecognised date-only form — `May 1, 2026` and friends. The engine reads
  // those as local midnight, so re-anchor the calendar date it found onto UTC.
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return utcFrom({ y: parsed.getFullYear(), m: parsed.getMonth() + 1, d: parsed.getDate() });
}

/**
 * Whether a date carries a time of day, and so should be shown with one.
 *
 * Derived from the value rather than recorded beside it, because a flag would
 * have to survive both the IPC structured clone *and* `session.json`, where a
 * `Date` becomes an ISO string on the way out. {@link parseDateish} is written to
 * uphold this: every date-only shape lands on exactly UTC midnight.
 *
 * The cost, which is the whole cost: a source that literally says
 * `2026-05-01T00:00:00Z` is indistinguishable from one that says `2026-05-01`.
 */
export function hasTimeOfDay(value: Date): boolean {
  return (
    value.getUTCHours() !== 0 ||
    value.getUTCMinutes() !== 0 ||
    value.getUTCSeconds() !== 0 ||
    value.getUTCMilliseconds() !== 0
  );
}
