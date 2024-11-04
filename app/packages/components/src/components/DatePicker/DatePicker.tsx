import React from "react";
import dayjs from "dayjs";
import {
  LocalizationProvider,
  DatePicker,
  DateTimePicker,
} from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";

interface DatePickerProps {
  label: string;
  isDateTime: boolean;
  value: dayjs.Dayjs | null;
  onChange: (newValue: dayjs.Dayjs | null) => void;
  minDate?: dayjs.Dayjs;
  maxDate?: dayjs.Dayjs;
}

const format = "YYYY-M-D HH:mm:ss";

const BasicDatePicker: React.FC<DatePickerProps> = ({
  label,
  isDateTime,
  value,
  onChange,
  minDate,
  maxDate,
}) => {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      {isDateTime ? (
        <DateTimePicker
          label={label}
          value={value}
          onChange={(newValue) => {
            onChange(newValue);
          }}
          minDate={minDate}
          maxDate={maxDate}
          format={format}
        />
      ) : (
        <DatePicker
          label={label}
          value={value}
          onChange={(newValue) => {
            onChange(newValue);
          }}
          minDate={minDate}
          maxDate={maxDate}
          format={format}
        />
      )}
    </LocalizationProvider>
  );
};

export default BasicDatePicker;
