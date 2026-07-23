import { useTimeZone } from "@fiftyone/state";
import { serializeDateValue, toPickerDate } from "@fiftyone/utilities";
import { WidgetProps } from "@rjsf/utils";
import { DatePicker, FormField } from "@voxel51/voodo";
import { useMemo } from "react";

export default function DatePickerWidget(props: WidgetProps) {
  const {
    label,
    value,
    disabled,
    readonly,
    autofocus,
    onChange = () => {},
    options,
  } = props;

  const timeZone = useTimeZone();
  const dateOnly = !!options?.dateOnly;
  const type = dateOnly ? "date" : "datetime";

  // form data holds an ISO instant string; render it as the wall clock the
  // app displays for the field (UTC calendar date for date fields, the app
  // timezone for datetime fields)
  const selected = useMemo(() => {
    if (typeof value !== "string" || !value) return null;
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return null;
    return toPickerDate(type, timestamp, timeZone);
  }, [value, type, timeZone]);

  const inputComponent = (
    <DatePicker
      disabled={disabled || readonly}
      autoFocus={autofocus}
      selected={selected}
      showTimeSelect={!dateOnly}
      onChange={(date: Date | null) => {
        if (date && !Number.isNaN(date.getTime())) {
          try {
            onChange(serializeDateValue(type, date, timeZone));
          } catch (error) {
            console.warn("unserializable date", date, error);
          }
        } else {
          onChange(undefined);
        }
      }}
    />
  );

  return <FormField control={inputComponent} label={label} />;
}
