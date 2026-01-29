import { WidgetProps } from "@rjsf/utils";
import { Checkbox, Orientation, Stack } from "@voxel51/voodo";
import React from "react";

export default function CheckboxWidget(props: WidgetProps) {
  const { label, value, disabled, readonly, onChange } = props;

  const checked = Boolean(value);

  return (
    <Stack orientation={Orientation.Column}>
      <Checkbox
        label={label}
        checked={checked}
        onChange={onChange}
        disabled={disabled || readonly}
      />
    </Stack>
  );
}
