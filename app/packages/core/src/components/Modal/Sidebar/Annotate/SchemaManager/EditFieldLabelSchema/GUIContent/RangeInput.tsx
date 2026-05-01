/**
 * Range input component for slider min/max values.
 */

import {
  Input,
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";

interface RangeInputProps {
  range: { min: string; max: string } | null;
  onRangeChange: (range: { min: string; max: string }) => void;
  /** Validation error for range from parent */
  error?: string | null;
  /** Use larger, primary-colored labels */
  largeLabels?: boolean;
  readOnly?: boolean;
}

const RangeInput = ({
  range,
  onRangeChange,
  error = null,
  largeLabels = false,
  readOnly = false,
}: RangeInputProps) => {
  const min = range?.min || "";
  const max = range?.max || "";

  const labelVariant = largeLabels ? TextVariant.Lg : TextVariant.Md;
  const labelColor = largeLabels ? TextColor.Primary : TextColor.Secondary;

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
      <Stack orientation={Orientation.Row} spacing={Spacing.Md}>
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Sm}
          style={{ flex: 1 }}
        >
          <Text variant={labelVariant} color={labelColor}>
            Min
          </Text>
          <Input
            type="number"
            value={min}
            onChange={(e) => onRangeChange({ min: e.target.value, max })}
            placeholder="Minimum value"
            error={!!error}
            disabled={readOnly}
          />
        </Stack>
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Sm}
          style={{ flex: 1 }}
        >
          <Text variant={labelVariant} color={labelColor}>
            Max
          </Text>
          <Input
            type="number"
            value={max}
            onChange={(e) => onRangeChange({ min, max: e.target.value })}
            placeholder="Maximum value"
            error={!!error}
            disabled={readOnly}
          />
        </Stack>
      </Stack>
      {error && (
        <Text variant={TextVariant.Sm} color={TextColor.Destructive}>
          {error}
        </Text>
      )}
    </Stack>
  );
};

export default RangeInput;
