import React from "react";
import dayjs from 'dayjs';
import { atom, useRecoilState } from "recoil";
import TextField from '@mui/material/TextField';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';


interface DatePickerProps {
  label: string;
}

const dateValue = atom({
  key: "dateValue",
  default: dayjs('2024-01-01'),
});

const BasicDatePicker: React.FC<DatePickerProps> = ({
  label,
}) => {
  const [value, setValue] = useRecoilState(dateValue);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DatePicker
        label={label}
        value={value}
        onChange={(newValue) => {
          setValue(newValue);
        }}
        renderInput={(params) => <TextField {...params} />}
      />
    </LocalizationProvider>
  );
}

export default BasicDatePicker;

