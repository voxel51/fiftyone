/**
 * Range input component for int/float attributes.
 */

import { Input, Text, TextColor, TextVariant } from "@voxel51/voodo";

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

  return (
    <div>
      <Text
        variant={TextVariant.Md}
        color={TextColor.Secondary}
        style={{ marginBottom: 8 }}
      >
        Range
      </Text>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            Min
          </Text>
          <Input
            type="number"
            value={range?.[0]?.toString() ?? ""}
            onChange={(e) => handleMinChange(e.target.value)}
            placeholder="0"
            style={{ width: 80 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            Max
          </Text>
          <Input
            type="number"
            value={range?.[1]?.toString() ?? ""}
            onChange={(e) => handleMaxChange(e.target.value)}
            placeholder="100"
            style={{ width: 80 }}
          />
        </div>
      </div>
    </div>
  );
};

export default RangeInput;
