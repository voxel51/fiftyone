import { DateTime } from "luxon";

export const INPUT_TYPE_DATE = "date";
export const INPUT_TYPE_DATE_TIME = "datetime-local";

export function dateFromDateString(v: string): number {
  const [year, month, day] = v.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function dateFromDateTimeString(timeZone: string, v: string): number {
  const [date, time] = v.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const times = time.split(":"); // HH:MM:SS or HH:MM, we handle both cases

  if (times.length === 3) {
    const [hour, minute, second] = times.map(Number);
    return DateTime.fromObject(
      { year, month, day, hour, minute, second },
      { zone: timeZone },
    ).valueOf();
  }

  const [hour, minute] = times.map(Number);
  return DateTime.fromObject(
    { year, month, day, hour, minute },
    { zone: timeZone },
  ).valueOf();
}

export function formatDateTimePicker(timeZone: string, v: number): string {
  const date = new Date(v);
  const year = Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone,
  }).format(date);
  const month = Intl.DateTimeFormat("en", {
    month: "2-digit",
    timeZone,
  }).format(date);
  const day = Intl.DateTimeFormat("en", { day: "2-digit", timeZone }).format(
    date,
  );
  const hour = Intl.DateTimeFormat("en", {
    hour: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
  const minutes = Intl.DateTimeFormat("en", {
    minute: "2-digit",
    timeZone,
  }).format(date);
  const seconds = Intl.DateTimeFormat("en", {
    second: "2-digit",
    timeZone,
  }).format(date);

  return `${year}-${month}-${day}T${hour}:${handleDigits(
    minutes,
  )}:${handleDigits(seconds)}`;
}

export function formatDatePicker(v: number): string {
  const date = new Date(v);
  const year = Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  const month = Intl.DateTimeFormat("en", {
    month: "2-digit",
    timeZone: "UTC",
  }).format(date);
  const day = Intl.DateTimeFormat("en", {
    day: "2-digit",
    timeZone: "UTC",
  }).format(date);

  return `${year}-${month}-${day}`;
}

const handleDigits = (digits: string) => {
  return Number.parseInt(digits).toLocaleString("en-US", {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
};

/**
 * Format an absolute timestamp as a relative time string, e.g. "3 hours ago"
 * @param timestamp - epoch milliseconds
 * @returns the relative time string, or null for an invalid timestamp
 */
export function formatRelativeTime(timestamp: number): string | null {
  return DateTime.fromMillis(timestamp).toRelative();
}

/**
 * FiftyOne renders `date` fields as the UTC calendar date and `datetime`
 * fields in the app timezone (`fo.config.timezone`, "UTC" by default),
 * while react-datepicker only operates on Date objects interpreted in the
 * browser's local timezone. The helpers below translate between the two so
 * pickers show and store the same wall-clock values the rest of the app
 * displays.
 */

export type DateFieldType = "date" | "datetime";

/**
 * Convert an absolute timestamp into a Date whose local-timezone components
 * match what the app displays for the field, suitable for react-datepicker
 * @param type - the type of the field
 * @param timestamp - epoch milliseconds
 * @param timeZone - the app display timezone (IANA name, "UTC", or "local")
 * @returns a Date carrying the displayed wall-clock values in local time
 */
export function toPickerDate(
  type: DateFieldType,
  timestamp: number,
  timeZone: string,
): Date {
  if (type === "date") {
    const date = new Date(timestamp);
    return new Date(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      12,
    );
  }

  const dt = DateTime.fromMillis(timestamp, { zone: timeZone });

  // an invalid zone or timestamp yields NaN components; throw instead of
  // handing the picker an Invalid Date
  if (!dt.isValid) {
    throw new Error(`invalid date or timezone: ${timestamp} (${timeZone})`);
  }

  return new Date(
    dt.year,
    dt.month - 1,
    dt.day,
    dt.hour,
    dt.minute,
    dt.second,
    dt.millisecond,
  );
}

/**
 * Serialize a picker Date's calendar date to an absolute instant at noon
 * UTC, so the stored value renders as the same calendar date in every
 * timezone
 */
export function dateOnlyToUTC(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  return new Date(Date.UTC(year, month, day, 12, 0, 0, 0)).toISOString();
}

export function serializeDateValue(
  type: DateFieldType,
  date: Date,
  timeZone: string,
): string {
  if (type === "date") {
    return dateOnlyToUTC(date);
  }

  // the picker's Date components are wall-clock values in the app display
  // timezone; interpret them there to recover the absolute instant
  const iso = DateTime.fromObject(
    {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
      millisecond: date.getMilliseconds(),
    },
    { zone: timeZone },
  )
    .toUTC()
    .toISO();

  // an invalid zone or date yields null; throw so callers skip the mutation
  // instead of treating the value as missing and deleting the field
  if (iso === null) {
    throw new Error(`invalid date or timezone: ${date} (${timeZone})`);
  }

  return iso;
}
