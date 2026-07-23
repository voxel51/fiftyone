import { useTimeZone } from "@fiftyone/state";
import { serializeDateValue, toPickerDate } from "@fiftyone/utilities";
import { WidgetProps } from "@rjsf/utils";
import { DatePicker, FormField } from "@voxel51/voodo";
import { useCallback, useMemo } from "react";

/**
 * Form data carries dates as ISO instant strings. The picker renders and
 * edits them as the local date and time the app displays for the field:
 * the UTC calendar date for date fields, the time in the app timezone for
 * datetime fields.
 */
export default function DatePickerWidget(props: WidgetProps) {
  const { label, value, disabled, readonly, autofocus, onChange, options } =
    props;

  const timeZone = useTimeZone();
  const type = options?.dateOnly ? "date" : "datetime";

  const selected = useMemo(() => {
    const timestamp =
      typeof value === "string" ? Date.parse(value) : Number.NaN;
    if (Number.isNaN(timestamp)) {
      return null;
    }

    try {
      return toPickerDate(type, timestamp, timeZone);
    } catch (error) {
      console.warn("unrenderable date", value, error);
      return null;
    }
  }, [value, type, timeZone]);

  const handleChange = useCallback(
    (date: Date | null) => {
      if (!date || Number.isNaN(date.getTime())) {
        onChange(undefined);
        return;
      }

      try {
        onChange(serializeDateValue(type, date, timeZone));
      } catch (error) {
        console.warn("unserializable date", date, error);
      }
    },
    [onChange, type, timeZone],
  );

  return (
    <FormField
      label={label}
      control={
        <DatePicker
          disabled={disabled || readonly}
          autoFocus={autofocus}
          selected={selected}
          showTimeSelect={type === "datetime"}
          onChange={handleChange}
        />
      }
    />
  );
}
