/**
 * Range input component for slider min/max values.
 */

import { Input, Text, TextColor, TextVariant } from "@voxel51/voodo";

const LABEL_MARGIN_BOTTOM = "0.5rem";

interface RangeInputProps {
  range: { min: string; max: string } | null;
  onRangeChange: (range: { min: string; max: string }) => void;
  /** Validation error for range from parent */
  error?: string | null;
  /** Step value for slider */
  step?: string;
  /** Step change handler */
  onStepChange?: (step: string) => void;
  /** Step validation error from parent */
  stepError?: string | null;
  /** Use larger, primary-colored labels */
  largeLabels?: boolean;
}

const RangeInput = ({
  range,
  onRangeChange,
  error = null,
  step = "",
  onStepChange,
  stepError = null,
  largeLabels = false,
}: RangeInputProps) => {
  const min = range?.min || "";
  const max = range?.max || "";

  const labelVariant = largeLabels ? TextVariant.Lg : TextVariant.Md;
  const labelColor = largeLabels ? TextColor.Primary : TextColor.Secondary;

  return (
    <div>
      <div style={{ width: "100%", display: "flex", gap: "1rem" }}>
        <div style={{ flex: 1 }}>
          <Text
            variant={labelVariant}
            color={labelColor}
            style={{ marginBottom: LABEL_MARGIN_BOTTOM }}
          >
            Min
          </Text>
          <Input
            type="number"
            value={min}
            onChange={(e) => onRangeChange({ min: e.target.value, max })}
            placeholder="Minimum value"
            error={!!error}
          />
        </div>
        <div style={{ flex: 1 }}>
          <Text
            variant={labelVariant}
            color={labelColor}
            style={{ marginBottom: LABEL_MARGIN_BOTTOM }}
          >
            Max
          </Text>
          <Input
            type="number"
            value={max}
            onChange={(e) => onRangeChange({ min, max: e.target.value })}
            placeholder="Maximum value"
            error={!!error}
          />
        </div>
      </div>
      {error && (
        <Text
          variant={TextVariant.Sm}
          color={TextColor.Destructive}
          style={{ marginTop: 4 }}
        >
          {error}
        </Text>
      )}
      {onStepChange && (
        <div style={{ marginTop: "1rem" }}>
          <Text
            variant={labelVariant}
            color={labelColor}
            style={{ marginBottom: LABEL_MARGIN_BOTTOM }}
          >
            Step (optional)
          </Text>
          <Input
            type="number"
            value={step}
            onChange={(e) => onStepChange(e.target.value)}
            placeholder="Step size"
            error={!!stepError}
          />
          {stepError && (
            <Text
              variant={TextVariant.Sm}
              color={TextColor.Destructive}
              style={{ marginTop: 4 }}
            >
              {stepError}
            </Text>
          )}
        </div>
      )}
    </div>
  );
};

export default RangeInput;
