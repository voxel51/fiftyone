import { Select, SelectAnchor, ZIndex } from "@voxel51/voodo";
import { useMemo } from "react";

export interface McapSettingsSelectOption {
  readonly label: string;
  readonly value: string;
}

/**
 * The one single-choice select for MCAP settings surfaces: voodo `Select`
 * with the modal defaults baked in (exclusive, portalled above the modal),
 * so compact closed sets render and behave identically everywhere. Tiny
 * fixed enums (2–3 options) should prefer `RadioGroup`; long filterable
 * lists should prefer accessible radio rows — see the settings audit's
 * cardinality rule.
 */
export function McapSettingsSelect({
  ariaLabel,
  disabled,
  onChange,
  options,
  value,
}: {
  readonly ariaLabel: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
  readonly options: readonly McapSettingsSelectOption[];
  readonly value: string;
}) {
  const descriptors = useMemo(
    () =>
      options.map((option) => ({
        data: { label: option.label },
        id: option.value,
      })),
    [options],
  );

  return (
    <Select
      anchor={SelectAnchor.BottomStart}
      aria-label={ariaLabel}
      disabled={disabled}
      exclusive
      onChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
      options={descriptors}
      portal
      value={value}
      zIndex={ZIndex.AboveModal}
    />
  );
}
