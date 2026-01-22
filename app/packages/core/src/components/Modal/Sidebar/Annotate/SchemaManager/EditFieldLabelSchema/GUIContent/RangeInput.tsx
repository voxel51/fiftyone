/**
 * Range input component for slider min/max values.
 */

import { Input, Text, TextColor, TextVariant } from "@voxel51/voodo";

interface RangeInputProps {
  range: { min: string; max: string } | null;
  onRangeChange: (range: { min: string; max: string }) => void;
  /** Validation error from parent */
  error?: string | null;
}

const RangeInput = ({
  range,
  onRangeChange,
  error = null,
}: RangeInputProps) => {
  const min = range?.min || "";
  const max = range?.max || "";

  return (
    <div>
      <Text
        variant={TextVariant.Md}
        color={TextColor.Secondary}
        style={{ marginBottom: 8 }}
      >
        Range
      </Text>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Input
          type="number"
          value={min}
          onChange={(e) => onRangeChange({ min: e.target.value, max })}
          placeholder="Min"
          style={{ flex: 1 }}
          error={!!error}
        />
        <Text variant={TextVariant.Md} color={TextColor.Secondary}>
          to
        </Text>
        <Input
          type="number"
          value={max}
          onChange={(e) => onRangeChange({ min, max: e.target.value })}
          placeholder="Max"
          style={{ flex: 1 }}
          error={!!error}
        />
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
    </div>
  );
};

export default RangeInput;
