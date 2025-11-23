import * as fos from "@fiftyone/state";
import {
  dateFromDateString,
  dateFromDateTimeString,
  formatDatePicker,
  formatDateTimePicker,
  INPUT_TYPE_DATE,
  INPUT_TYPE_DATE_TIME,
  styles,
} from "@fiftyone/utilities";
import React, { useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { useKey } from "../hooks";
import { ViewPropsType } from "../utils/types";
import FieldWrapper from "./FieldWrapper";

export default function DateTimeView(props: ViewPropsType) {
  const timeZone = useRecoilValue<string>(fos.timeZone);
  const [formattedDate, setFormattedDate] = useState<string>("");
  const { onChange, schema, path, data } = props;
  const { compact, placeholder = "", readOnly } = schema.view;
  const [key, setUserChanged] = useKey(path, schema, data, true);

  const dateOnly = schema.view.date_only;
  const inputType = dateOnly ? INPUT_TYPE_DATE : INPUT_TYPE_DATE_TIME;

  const parseTimestamp = useMemo(() => {
    return dateOnly
      ? dateFromDateString
      : (v: string) => dateFromDateTimeString(timeZone, v);
  }, [dateOnly, timeZone]);
  const formatDate = useMemo(() => {
    return dateOnly
      ? formatDatePicker
      : (v: string) => formatDateTimePicker(timeZone, v);
  }, [dateOnly, timeZone]);

  useEffect(() => {
    if (!data) {
      setFormattedDate("");
      return;
    }

    // populate the user-facing field with data from the backend
    setFormattedDate(formatDate(data));
  }, [data, formatDate]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const timestamp = parseTimestamp(e.target.value);
    if (isNaN(timestamp)) {
      return;
    }
    onChange(path, timestamp);
    setUserChanged();
  }

  return (
    <FieldWrapper {...props} hideHeader={compact}>
      <styles.DateTimeInputContainer>
        <styles.DateTimeInput
          key={key}
          disabled={readOnly}
          type={inputType}
          placeholder={placeholder}
          value={formattedDate}
          onChange={handleChange}
        />
      </styles.DateTimeInputContainer>
    </FieldWrapper>
  );
}
