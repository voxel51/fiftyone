import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';

dayjs.extend(relativeTime);
dayjs.extend(utc);

export function timeFromNow(timestamp: TimestampType, withoutSuffix?: boolean) {
  return dayjs(timestamp).fromNow(withoutSuffix);
}

export function isExpired(timestamp: TimestampType) {
  return dayjs(timestamp).isBefore(dayjs());
}

export function shortDate(
  timestamp: TimestampType,
  options?: DateTimeOptionsType
) {
  const { includeUTC } = options || {};
  let defaultFormat = 'MMM D, YYYY';
  if (includeUTC) defaultFormat = withUTC(defaultFormat);
  return dayjs.utc(timestamp).format(defaultFormat);
}

export function longDate(
  timestamp: TimestampType,
  options?: DateTimeOptionsType
) {
  const { includeUTC } = options || {};
  let defaultFormat = 'MMMM D, YYYY';
  if (includeUTC) defaultFormat = withUTC(defaultFormat);
  return dayjs.utc(timestamp).format(defaultFormat);
}

export function dateTime(
  timestamp: TimestampType,
  options?: DateTimeOptionsType
) {
  const { format, includeUTC } = options || {};
  let defaultFormat = 'ddd MMM D, YYYY h:mm:ss.SSS A';
  if (includeUTC) defaultFormat = withUTC(defaultFormat);
  return dayjs(timestamp).format(format ?? defaultFormat);
}

function withUTC(format: string) {
  return format + ' UTC';
}

type TimestampType = Date | number | string;

type DateTimeOptionsType = {
  includeUTC?: boolean;
  format?: string;
};
