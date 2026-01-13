import { WidgetProps } from "@rjsf/utils";
import { Checkbox, Orientation, Stack, Text, TextColor } from "@voxel51/voodo";
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

  const handleChange = (newChecked: boolean): void => {
    onChange(newChecked);
  };

  return (
    <Stack orientation={Orientation.Column}>
      <Checkbox
        label={label}
        checked={checked}
        onChange={handleChange}
        disabled={disabled || readonly}
      />
      {rawErrors.length > 0 && (
        <Text color={TextColor.Destructive}>{rawErrors[0]}</Text>
      )}
    </Stack>
  );
}
