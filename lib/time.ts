import { APP_TIMEZONE } from "@/lib/constants";

type CalendarParts = { year: number; month: number; day: number };

function calendarParts(date: Date, timeZone = APP_TIMEZONE): CalendarParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(value.year), month: Number(value.month), day: Number(value.day) };
}

function localMidnightToInstant(parts: CalendarParts, timeZone = APP_TIMEZONE) {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day);
  let instant = desired;
  for (let pass = 0; pass < 3; pass += 1) {
    const observed = calendarParts(new Date(instant), timeZone);
    const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day);
    const observedHour = Number(new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant)).find((part) => part.type === "hour")?.value || 0);
    instant += desired - (observedAsUtc + observedHour * 60 * 60 * 1000);
  }
  return new Date(instant);
}

export function detroitDateKey(date = new Date()) {
  const parts = calendarParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function startOfIsoWeekDetroit(date = new Date()) {
  const local = calendarParts(date);
  const localDateAsUtc = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const isoWeekday = localDateAsUtc.getUTCDay() || 7;
  localDateAsUtc.setUTCDate(localDateAsUtc.getUTCDate() - isoWeekday + 1);
  return localMidnightToInstant({
    year: localDateAsUtc.getUTCFullYear(),
    month: localDateAsUtc.getUTCMonth() + 1,
    day: localDateAsUtc.getUTCDate(),
  });
}
