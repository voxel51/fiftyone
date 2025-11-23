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
      { zone: timeZone }
    ).valueOf();
  }

  const [hour, minute] = times.map(Number);
  return DateTime.fromObject(
    { year, month, day, hour, minute },
    { zone: timeZone }
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
    date
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
    minutes
  )}:${handleDigits(seconds)}`;
}

export function formatDatePicker(v: string): string {
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
