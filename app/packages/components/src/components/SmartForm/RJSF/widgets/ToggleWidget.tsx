/**
 * Toggle widget that manages its own label
 * Uses voodo's ToggleSwitch component with two buttons for boolean values
 */

import { WidgetProps } from "@rjsf/utils";
import {
  Descriptor,
  FormField,
  ToggleSwitch,
  ToggleSwitchTab,
} from "@voxel51/voodo";
import React, { useMemo } from "react";

export default function ToggleWidget(props: WidgetProps) {
  const {
    label,
    value,
    disabled,
    readonly,
    onChange = () => {},
    rawErrors = [],
  } = props;

  const tabs: Descriptor<ToggleSwitchTab>[] = useMemo(
    () => [
      {
        id: "false",
        data: {
          label: "False",
          content: null,
        },
      },
      {
        id: "true",
        data: {
          label: "True",
          content: null,
        },
      },
    ],
    []
  );

  const defaultIndex = value === true ? 1 : 0;

  const handleChange = (index: number) => {
    if (disabled || readonly) {
      return;
    }
    onChange(index === 1);
  };

  const isDisabled = disabled || readonly;

  const toggleComponent = (
    <div
      style={{
        opacity: isDisabled ? 0.5 : 1,
        pointerEvents: isDisabled ? "none" : "auto",
      }}
    >
      <ToggleSwitch
        tabs={tabs}
        defaultIndex={defaultIndex}
        onChange={handleChange}
      />
    </div>
  );

  return (
    <FormField
      control={toggleComponent}
      error={rawErrors.length > 0 ? rawErrors[0] : undefined}
      label={label}
    />
  );
}
