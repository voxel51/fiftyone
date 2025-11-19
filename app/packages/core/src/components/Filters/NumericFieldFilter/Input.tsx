import * as fos from "@fiftyone/state";
import {
  DATE_FIELD,
  DATE_TIME_FIELD,
  dateFromDateString,
  dateFromDateTimeString,
  FLOAT_FIELD,
  formatDatePicker,
  formatDateTimePicker,
  INPUT_TYPE_DATE,
  INPUT_TYPE_DATE_TIME,
  INT_FIELD,
  styles,
} from "@fiftyone/utilities";
import type { CSSProperties } from "react";
import React, { useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";

export type InputType =
  | typeof DATE_TIME_FIELD
  | typeof DATE_FIELD
  | typeof FLOAT_FIELD
  | typeof INT_FIELD;

export interface InputProps<T extends InputType> {
  color: string;
  ftype: T;
  placeholder?: string;
  onSubmit: (value: number | null) => void;
  style?: CSSProperties;
  value: number | null;
}

const TYPE_MAP = {
  [DATE_FIELD]: INPUT_TYPE_DATE,
  [DATE_TIME_FIELD]: INPUT_TYPE_DATE_TIME,
  [FLOAT_FIELD]: "string",
  [INT_FIELD]: "string",
};

const FROM_INPUT = (timeZone: string) => ({
  [DATE_FIELD]: dateFromDateString,
  [DATE_TIME_FIELD]: (v) => dateFromDateTimeString(timeZone, v),
  [INT_FIELD]: (v) => Number.parseInt(v, 10),
  [FLOAT_FIELD]: (v) => Number.parseFloat(v),
});

const TO_INPUT = (timeZone: string) => ({
  [DATE_FIELD]: formatDatePicker,
  [DATE_TIME_FIELD]: (v) => formatDateTimePicker(timeZone, v),
  [INT_FIELD]: (v) => String(v),
  [FLOAT_FIELD]: (v) => String(v),
});

export function Input<T extends InputType>({
  color,
  onSubmit,
  placeholder,
  value,
  ftype,
}: InputProps<T>) {
  const [state, setState] = useState<string>("");
  const timeZone = useRecoilValue(fos.timeZone);
  const { from, to } = useMemo(() => {
    return { from: FROM_INPUT(timeZone), to: TO_INPUT(timeZone) };
  }, [timeZone]);

  useEffect(() => {
    setState(value === null ? "" : to[ftype](value));
  }, [ftype, to, value]);

  return (
    <styles.DateTimeInputContainer
      style={{ borderBottom: `1px solid ${color}`, width: "50%" }}
    >
      <styles.DateTimeInput
        type={TYPE_MAP[ftype]}
        placeholder={placeholder}
        value={state ?? ""}
        onChange={(e) => {
          setState(e.target.value);
        }}
        onKeyDown={(e) => {
          e.key === "Enter" &&
            onSubmit(state === "" ? null : from[ftype](state));
        }}
        onBlur={() => {
          onSubmit(state === "" ? null : from[ftype](state));
        }}
      />
    </styles.DateTimeInputContainer>
  );
}
