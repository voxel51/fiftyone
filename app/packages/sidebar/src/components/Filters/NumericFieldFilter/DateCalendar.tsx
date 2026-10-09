import {
  DatePicker,
  DateRangeIcon,
  IconAction,
  Popover,
  PopoverAnchor,
  Size,
} from "@voxel51/voodo";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The calendar works in local wall-clock Dates; the input's text is the
 * field's own wall clock, so the two trade digits rather than instants.
 */
const toWallClock = (text: string) => {
  const [date, time = "00:00:00"] = text.trim().split(/[ T]/);
  const [year, month, day] = date.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = time.split(":").map(Number);
  const wallClock = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    Math.floor(second),
  );
  return Number.isNaN(wallClock.getTime()) ? null : wallClock;
};

const fromWallClock = (date: Date, time: boolean) => {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
  return time
    ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
        date.getSeconds(),
      )}`
    : day;
};

/**
 * A calendar beside a date input: picking a day (and a time, for datetimes)
 * hands back text in the input's own format.
 */
export default function DateCalendar({
  onPick,
  text,
  time,
}: {
  onPick: (text: string) => void;
  text: string;
  time: boolean;
}) {
  return (
    <Popover
      anchor={PopoverAnchor.BottomEnd}
      trigger={
        <IconAction icon={DateRangeIcon} size={Size.Sm} aria-label="Calendar" />
      }
    >
      {({ close }) => (
        <DatePicker
          inline
          selected={toWallClock(text)}
          showTimeSelect={time}
          timeIntervals={5}
          onChange={(date: Date | null) => {
            if (!date) return;
            onPick(fromWallClock(date, time));
            if (!time) close();
          }}
        />
      )}
    </Popover>
  );
}
