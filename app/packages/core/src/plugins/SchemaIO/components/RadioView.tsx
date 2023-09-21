import {
  FormControl,
  FormControlLabel,
  FormLabel,
  RadioGroup as MUIRadioGroup,
  Radio,
} from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import { autoFocus, getComponentProps } from "../utils";
import { useKey } from "../hooks";

export default function RadioView(props: RadioGroupProps) {
  const { schema, onChange, path, data } = props;
  const { view = {} } = schema;
  const { choices, label, description, orientation, readOnly } = view;

  const [key, setUserChanged] = useKey(path, schema);

  return (
    <FormControl {...getComponentProps(props, "container")}>
      {(label || description) && (
        <FormLabel
          sx={{ pb: 1 }}
          {...getComponentProps(props, "headerContainer")}
        >
          <HeaderView {...props} nested />
        </FormLabel>
      )}
      <MUIRadioGroup
        key={key}
        defaultValue={schema.default}
        onChange={(e, value) => {
          onChange(path, value);
          setUserChanged();
        }}
        sx={{ alignItems: "flex-start" }}
        row={orientation !== "vertical"}
        {...getComponentProps(props, "radioGroup")}
      >
        {choices.map(({ value, label, description, caption }, i) => (
          <FormControlLabel
            key={value}
            value={value}
            control={
              <Radio
                disabled={readOnly}
                autoFocus={autoFocus(props)}
                {...getComponentProps(props, "radio")}
              />
            }
            label={
              <HeaderView
                schema={{
                  view: {
                    label,
                    description,
                    caption,
                    componentsProps: {
                      header: getComponentProps(props, "radioHeader"),
                    },
                  },
                }}
                nested
              />
            }
            sx={{
              alignItems: "center",
              pb: i === choices.length - 1 ? 0 : 0.5,
            }}
            {...getComponentProps(props, "radioContainer")}
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
  onChange: (path: string, value: string) => void;
};
