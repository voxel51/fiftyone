import {
  FormControl,
  FormControlLabel,
  FormLabel,
  RadioGroup as MUIRadioGroup,
  Radio,
} from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import { autoFocus } from "../utils";

export default function RadioView(props: RadioGroupProps) {
  const { schema, onChange, path, data } = props;
  const { view = {} } = schema;
  const { choices, label, description, orientation } = view;
  return (
    <FormControl>
      {(label || description) && (
        <FormLabel sx={{ pb: 1 }}>
          <HeaderView {...props} />
        </FormLabel>
      )}
      <MUIRadioGroup
        defaultValue={data ?? schema.default}
        onChange={(e, value) => {
          onChange(path, value);
        }}
        sx={{ alignItems: "flex-start" }}
        row={orientation !== "vertical"}
      >
        {choices.map(({ value, label, description, caption }, i) => (
          <FormControlLabel
            key={value}
            value={value}
            control={<Radio autoFocus={autoFocus(props)} />}
            label={
              <HeaderView schema={{ view: { label, description, caption } }} />
            }
            sx={{
              alignItems: "center",
              pb: i === choices.length - 1 ? 0 : 0.5,
            }}
          />
        ))}
      </MUIRadioGroup>
    </FormControl>
  );
}

type Choice = {
  value: string;
  label: string;
  description?: string;
  caption?: string;
};

export type RadioGroupProps = {
  label?: string;
  description?: string;
  choices: Array<Choice>;
  onChange: (selected: string) => void;
};
