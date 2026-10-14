/**
 * Primitive field schema content component.
 * Similar to AttributeFormContent but for primitive field types (not labels).
 */

import {
  FormFieldGroup,
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { useCallback, useMemo, useState } from "react";
import PrimitiveRenderer from "../../../Edit/PrimitiveRenderer";
import { generatePrimitiveSchema } from "../../../Edit/schemaHelpers";
import {
  COMPONENT_OPTIONS,
  componentNeedsRange,
  componentNeedsValues,
  getSchemaTypeFromFieldType,
  NUMERIC_TYPES,
} from "../../constants";
import type { SchemaConfigType } from "../../utils";
import ComponentTypeButton from "./ComponentTypeButton";
import RangeInput from "./RangeInput";
import ValuesList from "./ValuesList";

interface PrimitiveFieldContentProps {
  /** Field name */
  field: string;
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

type RangeInputs = { min: string; max: string };

const rangeInputs = (
  range: [number, number] | undefined,
): RangeInputs | null =>
  range ? { min: String(range[0]), max: String(range[1]) } : null;

/** The range the inputs hold, or undefined while either is incomplete. */
const parseRangeInputs = (
  inputs: RangeInputs | null,
): [number, number] | undefined => {
  if (!inputs || inputs.min === "" || inputs.max === "") return undefined;
  const min = parseFloat(inputs.min);
  const max = parseFloat(inputs.max);
  return isNaN(min) || isNaN(max) ? undefined : [min, max];
};

const rangeKey = (range: [number, number] | undefined) =>
  range ? `${range[0]},${range[1]}` : "";

const PrimitiveFieldContent = ({
  field,
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
    rangeInputs(config?.range),
  );

  // A range set from outside (a scan, a discard) replaces the inputs. The
  // inputs' own edits are written back to the config too, so only replace
  // them when the config's range differs from what they hold: otherwise a
  // value would be rewritten as it is typed (e.g. "0.50" to "0.5").
  const configRangeKey = rangeKey(config?.range);
  const [syncedRangeKey, setSyncedRangeKey] = useState(configRangeKey);
  if (configRangeKey !== syncedRangeKey) {
    setSyncedRangeKey(configRangeKey);
    if (rangeKey(parseRangeInputs(range)) !== configRangeKey) {
      setRange(rangeInputs(config?.range));
    }
  }

  // Derived state
  const isNumericType = NUMERIC_TYPES.includes(schemaType);
  const isIntegerType = schemaType === "int" || schemaType === "list<int>";

  // Visibility flags
  const showValues = componentNeedsValues(component);
  const showRange = isNumericType && componentNeedsRange(component);

  // Validation errors
  const errors = useMemo(() => {
    const result = {
      values: null as string | null,
      range: null as string | null,
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

    return result;
  }, [showValues, showRange, values, range]);

  const hasErrors = useMemo(() => {
    if (!errors) return false;
    return Object.values(errors).some((error) => error !== null);
  }, [errors]);

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
    [config, onConfigChange],
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
    [config, onConfigChange, isNumericType],
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
    [config, onConfigChange],
  );

  const handleBlur = useCallback((field: keyof TouchedFields) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const previewSchema = useMemo(() => {
    return generatePrimitiveSchema(field, {
      type: schemaType,
      component,
      values,
      range: range
        ? ([parseFloat(range.min), parseFloat(range.max)] as [number, number])
        : undefined,
      choices: componentOptions.map((opt) => opt.label),
    });
  }, [field, schemaType, component, values, range, componentOptions]);

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Lg}>
      {/* Component type buttons */}
      {componentOptions.length > 0 && (
        <FormFieldGroup orientation={Orientation.Column} spacing={Spacing.Sm}>
          <Text
            variant={largeLabels ? TextVariant.Lg : TextVariant.Md}
            color={TextColor.Primary}
          >
            Input type
          </Text>
          <div style={{ width: "100%", display: "flex", gap: 8 }}>
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
          </div>
        </FormFieldGroup>
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
      {!hasErrors && (
        <>
          <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
            <Text variant={TextVariant.Lg}>Field preview:</Text>
            <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
              How this field will appear to users during annotation
            </Text>
          </Stack>
          <PrimitiveRenderer
            type={schemaType}
            fieldValue={null}
            handleChange={() => {}}
            primitiveSchema={previewSchema}
          />
        </>
      )}
    </Stack>
  );
};

export default PrimitiveFieldContent;
