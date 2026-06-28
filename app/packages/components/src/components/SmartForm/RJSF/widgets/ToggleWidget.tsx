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
import { useMemo } from "react";

/**
 * Convert a voodo toggle tabs into a boolean value
 * switcher.
 */
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
    [],
  );

  // Controlled: drive the active tab from `value` so an external change (e.g.
  // scrubbing video frames, an out-of-band keyframe toggle) is reflected. An
  // uncontrolled `defaultIndex` is read once at mount and would go stale.
  const activeIndex = value === true ? 1 : 0;
  const isDisabled = disabled || readonly;

  const handleChange = (index: number) => {
    if (isDisabled) return;

    onChange(index === 1);
  };

  const toggleComponent = (
    <div
      style={{
        opacity: isDisabled ? 0.5 : 1,
        pointerEvents: isDisabled ? "none" : "auto",
      }}
    >
      <ToggleSwitch tabs={tabs} index={activeIndex} onChange={handleChange} />
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
