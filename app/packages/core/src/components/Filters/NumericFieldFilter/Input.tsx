import * as fos from "@fiftyone/state";
import {
  DATE_FIELD,
  DATE_TIME_FIELD,
  FLOAT_FIELD,
  INT_FIELD,
} from "@fiftyone/utilities";
import { DateTime } from "luxon";
import type { CSSProperties } from "react";
import React, { useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";

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

const StyledInputContainer = styled.div`
  font-size: 14px;
  border-bottom: 1px ${({ theme }) => theme.primary.plainColor} solid;
  position: relative;
  margin: 0.5rem 0;
  max-width: calc(50% - 0.5rem);
`;

const StyledInput = styled.input`
  &::-webkit-calendar-picker-indicator {
    display: none;
  }

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  /* Firefox */
  &[type="number"] {
    -moz-appearance: textfield;
  }

  background-color: transparent;
  border: none;
  color: ${({ theme }) => theme.text.secondary};
  height: 2rem;
  border: none;
  align-items: center;
  font-weight: bold;
  width: 100%;

  &:focus {
    border: none;
    outline: none;
    font-weight: bold;
  }

  &::placeholder {
    color: ${({ theme }) => theme.text.secondary};
    font-weight: bold;
  }
`;

const TYPE_MAP = {
  [DATE_FIELD]: "date",
  [DATE_TIME_FIELD]: "datetime-local",
  [FLOAT_FIELD]: "string",
  [INT_FIELD]: "string",
};

const FROM_INPUT = (timeZone: string) => ({
  [DATE_FIELD]: (v) => {
    const [year, month, day] = v.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  },
  [DATE_TIME_FIELD]: (v) => {
    const [date, time] = v.split("T");
    const [year, month, day] = date.split("-").map(Number);
    const times = time.split(":");
    if (times.length === 3) {
      const [hour, minute, second] = time.split(":");
      return DateTime.fromObject(
        { year, month, day, hour, minute, second },
        { zone: timeZone }
      ).valueOf();
    }

    const [hour, minute] = time.split(":");
    return DateTime.fromObject(
      { year, month, day, hour, minute },
      { zone: timeZone }
    ).valueOf();
  },
  [INT_FIELD]: (v) => Number.parseInt(v, 10),
  [FLOAT_FIELD]: (v) => Number.parseFloat(v),
});

const TO_INPUT = (timeZone: string) => ({
  [DATE_FIELD]: (v) => {
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
  },
  [DATE_TIME_FIELD]: (v) => {
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
  },
  [INT_FIELD]: (v) => String(v),
  [FLOAT_FIELD]: (v) => String(v),
});

const handleDigits = (digits: string) => {
  return Number.parseInt(digits).toLocaleString("en-US", {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
};

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
    <StyledInputContainer
      style={{ borderBottom: `1px solid ${color}`, width: "50%" }}
    >
      <StyledInput
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
    </StyledInputContainer>
  );
}
