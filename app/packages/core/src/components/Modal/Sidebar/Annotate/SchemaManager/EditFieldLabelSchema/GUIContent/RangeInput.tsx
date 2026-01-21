/**
 * Range input component for slider min/max values.
 */

import { Input, Text, TextColor, TextVariant } from "@voxel51/voodo";

interface RangeInputProps {
  range: { min: string; max: string } | null;
  onRangeChange: (range: { min: string; max: string }) => void;
}

const RangeInput = ({ range, onRangeChange }: RangeInputProps) => {
  const min = range?.min || "";
  const max = range?.max || "";

  const minMaxError =
    min !== "" && max !== "" && parseFloat(min) >= parseFloat(max);
  const requiredError = min === "" || max === "";

  const getErrorMessage = (): string | null => {
    if (minMaxError) return "Min must be less than max";
    if (requiredError) return "Min and max are required";
    return null;
  };
  const errorMessage = getErrorMessage();

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
          error={minMaxError || min === ""}
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
          error={minMaxError || max === ""}
        />
      </div>
      {errorMessage && (
        <Text
          variant={TextVariant.Sm}
          color={TextColor.Destructive}
          style={{ marginTop: 4 }}
        >
          {errorMessage}
        </Text>
      )}
    </div>
  );
};

export default RangeInput;
