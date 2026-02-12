import { WidgetProps } from "@rjsf/utils";
import { DatePicker, FormField } from "@voxel51/voodo";
import React from "react";

export default function DatePickerWidget(props: WidgetProps) {
  const {
    label,
    value,
    disabled,
    readonly,
    autofocus,
    onChange = () => {},
    options,
  } = props;

  const dateOnly = !!options?.dateOnly;

  const inputComponent = (
    <DatePicker
      disabled={disabled || readonly}
      autoFocus={autofocus}
      selected={value}
      showTimeSelect={!dateOnly}
      onChange={(date: Date | null) => {
        if (date && !Number.isNaN(date.getTime())) {
          onChange(date.toISOString());
        } else {
          onChange(undefined);
        }
      }}
    />
  );

  return <FormField control={inputComponent} label={label} />;
}
