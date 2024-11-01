import React from "react";
import { atom, useRecoilState } from "recoil";
import TextField from '@mui/material/TextField';
import AdapterDateFns from '@mui/lab/AdapterDateFns';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import DatePicker from '@mui/lab/DatePicker';


interface DatePickerProps {
  label: string;
}

const dateValue = atom({
  key: "dateValue",
  default: null,
});

const BasicDatePicker: React.FC<DatePickerProps> = ({
  label,
}) => {
  const [value, setValue] = useRecoilState(dateValue);

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
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

