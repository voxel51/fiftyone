/**
 * Primitive field schema content component.
 * Similar to AttributeFormContent but for primitive field types (not labels).
 */

import {
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { useCallback, useMemo, useState } from "react";
import {
  COMPONENT_OPTIONS,
  NUMERIC_TYPES,
  componentNeedsRange,
  componentNeedsValues,
  getSchemaTypeFromFieldType,
} from "../../constants";
import type { SchemaConfigType } from "../../utils";
import { validateRange, validateValues } from "../../utils";
import ComponentTypeButton from "./ComponentTypeButton";
import RangeInput from "./RangeInput";
import ValuesList from "./ValuesList";

interface PrimitiveFieldContentProps {
  /** Field type from fieldType atom (e.g., "Float", "String") */
  fieldType: string;
  /** Current schema config */
  config: SchemaConfigType | undefined;
  /** Callback when config changes */
  onConfigChange?: (config: SchemaConfigType) => void;
  /** Use larger, primary-colored labels */
  largeLabels?: boolean;
}

interface TouchedFields {
  values: boolean;
  range: boolean;
}

const PrimitiveFieldContent = ({
  fieldType,
  config,
  onConfigChange,
  largeLabels = false,
}: PrimitiveFieldContentProps) => {
  // Track which fields have been touched (blurred)
  const [touched, setTouched] = useState<TouchedFields>({
    values: false,
    range: false,
  });

  // Convert field type to schema type (e.g., "Float" -> "float")
  const schemaType = getSchemaTypeFromFieldType(fieldType);

  // Get component options for this type
  const componentOptions = COMPONENT_OPTIONS[schemaType] || [];

  // Current values from config
  const component = config?.component || componentOptions[0]?.id || "text";
  const values = config?.values?.map(String) || [];

  // Local state for range input (to allow typing partial values)
  const [range, setRange] = useState<{ min: string; max: string } | null>(
    config?.range
      ? { min: String(config.range[0]), max: String(config.range[1]) }
      : null
  );

  // Derived state
  const isNumericType = NUMERIC_TYPES.includes(schemaType);
  const isIntegerType = schemaType === "int" || schemaType === "list<int>";

  // Visibility flags
  const showValues = componentNeedsValues(component);
  const showRange = isNumericType && componentNeedsRange(component);

  // Validation errors
  const errors = useMemo(() => {
    return {
      values: showValues ? validateValues(values, isNumericType) : null,
      range: showRange ? validateRange(range) : null,
    };
  }, [showValues, showRange, values, range, isNumericType]);

  // Handlers
  const handleComponentChange = useCallback(
    (newComponent: string) => {
      if (!onConfigChange) return;
      // Reset to initial state when switching component
      const newConfig: SchemaConfigType = {
        ...config,
        component: newComponent,
      };
      delete newConfig.values;
      delete newConfig.range;

      // Reset local state
      setRange(null);
      setTouched({ values: false, range: false });
      onConfigChange(newConfig);
    },
    [config, onConfigChange]
  );

  const handleValuesChange = useCallback(
    (newValues: string[]) => {
      if (!onConfigChange) return;
      const convertedValues = isNumericType
        ? newValues.map((v) => parseFloat(v)).filter((n) => !isNaN(n))
        : newValues;
      onConfigChange({
        ...config,
        values: convertedValues,
      });
    },
    [config, onConfigChange, isNumericType]
  );

  const handleRangeChange = useCallback(
    (newRange: { min: string; max: string }) => {
      // Update local state immediately for typing
      setRange(newRange);

      // Always sync to config to keep external state in sync
      if (onConfigChange) {
        const min = parseFloat(newRange.min);
        const max = parseFloat(newRange.max);

        // If both values are valid numbers, set the range; otherwise clear it
        if (
          newRange.min !== "" &&
          newRange.max !== "" &&
          !isNaN(min) &&
          !isNaN(max)
        ) {
          onConfigChange({
            ...config,
            range: [min, max],
          });
        } else {
          // Clear range from config when either field is empty or invalid
          const { range: _, ...configWithoutRange } = config || {};
          onConfigChange(configWithoutRange);
        }
      }
    },
    [config, onConfigChange]
  );

  const handleBlur = useCallback((field: keyof TouchedFields) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Lg}>
      {/* Component type buttons */}
      {componentOptions.length > 0 && (
        <div>
          <Text
            variant={largeLabels ? TextVariant.Lg : TextVariant.Md}
            color={largeLabels ? TextColor.Primary : TextColor.Secondary}
            style={{ marginBottom: "0.5rem" }}
          >
            Input type
          </Text>
          <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
            {componentOptions.map((opt) => (
              <ComponentTypeButton
                key={opt.id}
                icon={opt.icon}
                label={opt.label}
                isSelected={component === opt.id}
                onClick={() => handleComponentChange(opt.id)}
                largeText={largeLabels}
              />
            ))}
          </Stack>
        </div>
      )}

      {/* Values list */}
      {showValues && (
        <div onBlur={() => handleBlur("values")}>
          <ValuesList
            values={values}
            onValuesChange={handleValuesChange}
            isNumeric={isNumericType}
            isInteger={isIntegerType}
            error={touched.values ? errors.values : null}
            largeLabels={largeLabels}
          />
        </div>
      )}

      {/* Range input */}
      {showRange && (
        <div onBlur={() => handleBlur("range")}>
          <RangeInput
            range={range}
            onRangeChange={handleRangeChange}
            error={touched.range ? errors.range : null}
            largeLabels={largeLabels}
          />
        </div>
      )}
    </Stack>
  );
};

export default PrimitiveFieldContent;
