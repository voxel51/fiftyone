/**
 * Primitive field schema content component.
 * Similar to AttributeFormContent but for primitive field types (not labels).
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
import { useCallback, useMemo, useState } from "react";
import {
  COMPONENT_OPTIONS,
  NO_DEFAULT_TYPES,
  NUMERIC_TYPES,
  componentNeedsRange,
  componentNeedsValues,
  getSchemaTypeFromFieldType,
} from "../../constants";
import type { SchemaConfigType } from "../../utils";
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
}

interface TouchedFields {
  values: boolean;
  range: boolean;
  default: boolean;
}

const PrimitiveFieldContent = ({
  fieldType,
  config,
  onConfigChange,
}: PrimitiveFieldContentProps) => {
  // Track which fields have been touched (blurred)
  const [touched, setTouched] = useState<TouchedFields>({
    values: false,
    range: false,
    default: false,
  });

  // Convert field type to schema type (e.g., "Float" -> "float")
  const schemaType = getSchemaTypeFromFieldType(fieldType);

  // Get component options for this type
  const componentOptions = COMPONENT_OPTIONS[schemaType] || [];

  // Current values from config
  const component = config?.component || componentOptions[0]?.id || "text";
  const values = config?.values?.map(String) || [];
  const range = config?.range
    ? { min: String(config.range[0]), max: String(config.range[1]) }
    : null;
  const defaultValue =
    config?.default !== undefined ? String(config.default) : "";

  // Derived state
  const isNumericType = NUMERIC_TYPES.includes(schemaType);
  const isIntegerType = schemaType === "int";
  const supportsDefault = !NO_DEFAULT_TYPES.includes(schemaType);

  // Visibility flags
  const showValues = componentNeedsValues(component);
  const showRange = isNumericType && componentNeedsRange(component);

  // Validation errors
  const errors = useMemo(() => {
    const result = {
      values: null as string | null,
      range: null as string | null,
      default: null as string | null,
    };

    // Values validation - required for radio/dropdown/checkboxes
    if (showValues && values.length === 0) {
      result.values = "At least one value is required";
    }

    // Range validation - required for slider
    if (showRange) {
      if (!range || range.min === "" || range.max === "") {
        result.range = "Min and max are required";
      } else {
        const min = parseFloat(range.min);
        const max = parseFloat(range.max);
        if (isNaN(min) || isNaN(max)) {
          result.range = "Min and max must be valid numbers";
        } else if (min >= max) {
          result.range = "Min must be less than max";
        }
      }
    }

    // Default validation
    if (defaultValue) {
      // Check against range
      if (showRange && range && !result.range) {
        const min = parseFloat(range.min);
        const max = parseFloat(range.max);
        const defaultNum = parseFloat(defaultValue);
        if (!isNaN(defaultNum) && (defaultNum < min || defaultNum > max)) {
          result.default = `Default must be between ${range.min} and ${range.max}`;
        }
      }

      // Check against values
      if (showValues && values.length > 0 && !result.values) {
        if (!values.includes(defaultValue)) {
          result.default = "Default must be one of the provided values";
        }
      }
    }

    return result;
  }, [showValues, showRange, values, range, defaultValue]);

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

      setTouched({ values: false, range: false, default: false });
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
    (newRange: { min: string; max: string } | null) => {
      if (!onConfigChange) return;
      if (newRange) {
        const min = parseFloat(newRange.min);
        const max = parseFloat(newRange.max);
        // Only save valid numbers, but allow partial input
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
        }
      }
    },
    [config, onConfigChange]
  );

  const handleDefaultChange = useCallback(
    (value: string) => {
      if (!onConfigChange) return;
      let convertedValue: string | number | undefined = value;
      if (isNumericType && value) {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          convertedValue = num;
        }
      }
      onConfigChange({
        ...config,
        default: convertedValue || undefined,
      });
    },
    [config, onConfigChange, isNumericType]
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
            variant={TextVariant.Md}
            color={TextColor.Secondary}
            style={{ marginBottom: 8 }}
          >
            Input type
          </Text>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {componentOptions.map((opt) => (
              <ComponentTypeButton
                key={opt.id}
                icon={opt.icon}
                label={opt.label}
                isSelected={component === opt.id}
                onClick={() => handleComponentChange(opt.id)}
              />
            ))}
          </div>
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
          />
        </div>
      )}

      {/* Default value */}
      {supportsDefault && (
        <div>
          <Text
            variant={TextVariant.Md}
            color={TextColor.Secondary}
            style={{ marginBottom: 8 }}
          >
            Default (optional)
          </Text>
          <Input
            type={isNumericType ? "number" : "text"}
            value={defaultValue}
            onChange={(e) => handleDefaultChange(e.target.value)}
            onBlur={() => handleBlur("default")}
            placeholder={isNumericType ? "Default number" : "Default value"}
            error={touched.default && !!errors.default}
          />
          {touched.default && errors.default && (
            <Text
              variant={TextVariant.Sm}
              color={TextColor.Destructive}
              style={{ marginTop: 4 }}
            >
              {errors.default}
            </Text>
          )}
        </div>
      )}
    </Stack>
  );
};

export default PrimitiveFieldContent;
