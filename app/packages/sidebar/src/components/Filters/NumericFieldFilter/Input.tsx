import * as fos from "@fiftyone/state";
import {
  DATE_FIELD,
  DATE_TIME_FIELD,
  dateFromDateString,
  dateFromDateTimeString,
  FLOAT_FIELD,
  formatDatePicker,
  formatDateTimePicker,
  INT_FIELD,
} from "@fiftyone/utilities";
import { Input as VoodoInput, Size } from "@voxel51/voodo";
import { useEffect, useMemo, useState } from "react";
import { useReverbValue } from "@fiftyone/reverb";
import { underline } from "../styles";

export type InputType =
  | typeof DATE_TIME_FIELD
  | typeof DATE_FIELD
  | typeof FLOAT_FIELD
  | typeof INT_FIELD;

export interface InputProps<T extends InputType> {
  /** The field's bound on this side, shown while the range is open there */
  bound: number | null;
  color: string;
  ftype: T;
  placeholder?: string;
  onSubmit: (value: number | null) => void;
  value: number | null;
}

/** `YYYY-MM-DD HH:MM:SS`; a date alone is its midnight, fractions are dropped */
const fromDateTimeText = (timeZone: string, text: string) => {
  const [date, time = "00:00"] = text.trim().split(/[ T]/);
  return dateFromDateTimeString(timeZone, `${date}T${time.split(".")[0]}`);
};

const FROM_TEXT = (timeZone: string) => ({
  [DATE_FIELD]: (v: string) => dateFromDateString(v.trim()),
  [DATE_TIME_FIELD]: (v: string) => fromDateTimeText(timeZone, v),
  [INT_FIELD]: (v: string) => Number.parseInt(v, 10),
  [FLOAT_FIELD]: (v: string) => Number.parseFloat(v),
});

const TO_TEXT = (timeZone: string) => ({
  [DATE_FIELD]: formatDatePicker,
  [DATE_TIME_FIELD]: (v: number) =>
    formatDateTimePicker(timeZone, v).replace("T", " "),
  [INT_FIELD]: (v: number) => String(v),
  [FLOAT_FIELD]: (v: number) => String(v),
});

/**
 * One end of a numeric range, as text. Shows the field's bound while that end
 * is open; leaving the bound untouched keeps the end open.
 */
export function Input<T extends InputType>({
  bound,
  color,
  onSubmit,
  placeholder,
  value,
  ftype,
}: InputProps<T>) {
  const timeZone = useReverbValue(fos.timeZone);
  const { from, to } = useMemo(
    () => ({ from: FROM_TEXT(timeZone), to: TO_TEXT(timeZone) }),
    [timeZone],
  );
  const shown = value ?? bound;
  const text = shown === null ? "" : to[ftype](shown);
  const [state, setState] = useState(text);

  useEffect(() => {
    setState(text);
  }, [text]);

  const submit = () => {
    if (state === text) return;
    if (state.trim() === "") {
      value === null ? setState(text) : onSubmit(null);
      return;
    }
    const parsed = from[ftype](state);
    if (Number.isNaN(parsed)) {
      setState(text);
      return;
    }
    onSubmit(parsed);
  };

  return (
    <VoodoInput
      size={Size.Sm}
      borderless
      aria-label={placeholder}
      placeholder={placeholder}
      value={state}
      onChange={(e) => setState(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && submit()}
      onBlur={submit}
      {...underline(color)}
    />
  );
}
