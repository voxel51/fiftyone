import { WidgetProps } from "@rjsf/utils";
import { Checkbox } from "@voxel51/voodo";
import React from "react";

export default function CheckboxWidget(props: WidgetProps) {
  const {
    label,
    value,
    disabled,
    readonly,
    onChange = () => {},
    rawErrors = [],
  } = props;

  const checked = Boolean(value);

  const handleChange = (newChecked: boolean) => {
    onChange(newChecked);
  };
  return (
    <Checkbox
      {...props}
      checked={checked}
      onChange={handleChange}
      disabled={disabled || readonly}
    />
  );
}
