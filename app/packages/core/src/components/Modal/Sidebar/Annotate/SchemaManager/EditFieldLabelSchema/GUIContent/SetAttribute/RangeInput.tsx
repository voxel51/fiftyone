/**
 * Range input component for int/float attributes.
 */

import { Input, Text, TextColor, TextVariant } from "@voxel51/voodo";
import { FormFieldRow } from "../../../styled";

interface RangeInputProps {
  range: [number, number] | null;
  onRangeChange: (min: number | null, max: number | null) => void;
}

const RangeInput = ({ range, onRangeChange }: RangeInputProps) => {
  const handleMinChange = (value: string) => {
    const min = value ? Number(value) : null;
    const max = range?.[1] ?? null;
    onRangeChange(min, max);
  };

  const handleMaxChange = (value: string) => {
    const min = range?.[0] ?? null;
    const max = value ? Number(value) : null;
    onRangeChange(min, max);
  };

  const hasError =
    range !== null &&
    range[0] !== null &&
    range[1] !== null &&
    range[0] >= range[1];

  return (
    <div>
      <Text
        variant={TextVariant.Md}
        color={TextColor.Secondary}
        style={{ marginBottom: 8 }}
      >
        Range
      </Text>
      <FormFieldRow style={{ gap: "1rem" }}>
        <FormFieldRow>
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            Min
          </Text>
          <Input
            type="number"
            value={range?.[0]?.toString() ?? ""}
            onChange={(e) => handleMinChange(e.target.value)}
            style={{ width: 80 }}
            error={hasError}
          />
        </FormFieldRow>
        <FormFieldRow>
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            Max
          </Text>
          <Input
            type="number"
            value={range?.[1]?.toString() ?? ""}
            onChange={(e) => handleMaxChange(e.target.value)}
            style={{ width: 80 }}
            error={hasError}
          />
        </FormFieldRow>
      </FormFieldRow>
      {hasError && (
        <Text
          variant={TextVariant.Sm}
          color={TextColor.Destructive}
          style={{ marginTop: 4 }}
        >
          Min must be less than max
        </Text>
      )}
    </div>
  );
};

export default RangeInput;
