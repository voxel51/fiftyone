import React from "react";
import {
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup as MUIRadioGroup,
} from "@mui/material";
import Header from "./Header";

export default function RadioView(props: RadioGroupProps) {
  const { schema, onChange, path } = props;
  const { view = {} } = schema;
  const { choices, label, description } = view;
  return (
    <FormControl>
      {(label || description) && (
        <FormLabel sx={{ pb: 1 }}>
          <Header
            label={label as string}
            description={description}
            variant="secondary"
          />
        </FormLabel>
      )}
      <MUIRadioGroup
        value={schema.default}
        onChange={(e, value) => {
          onChange(path, value);
        }}
        row
      >
        {choices.map(({ value, label, description, caption }, i) => (
          <FormControlLabel
            key={value}
            value={value}
            control={<Radio disableRipple />}
            label={
              <Header
                label={label}
                description={description}
                caption={caption}
                variant="secondary"
              />
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
