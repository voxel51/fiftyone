/**
 * Date/datetime input widget using native HTML5 date inputs
 */

import { WidgetProps } from "@rjsf/utils";
import { FormField, Input } from "@voxel51/voodo";
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

  const dateOnly = options?.dateOnly ?? false;
  const inputType = dateOnly ? "date" : "datetime-local";

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value || undefined);
  };

  const inputComponent = (
    <Input
      disabled={disabled || readonly}
      autoFocus={autofocus}
      type={inputType}
      value={value ?? ""}
      onChange={handleChange}
    />
  );

  return <FormField control={inputComponent} label={label} />;
}
