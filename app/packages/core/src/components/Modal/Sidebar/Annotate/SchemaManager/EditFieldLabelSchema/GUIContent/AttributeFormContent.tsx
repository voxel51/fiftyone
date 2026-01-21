/**
 * Attribute form content component for add/edit attribute.
 */

import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
import {
  Input,
  Orientation,
  Select,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Toggle,
} from "@voxel51/voodo";
import { useCallback } from "react";
import {
  ATTRIBUTE_TYPE_OPTIONS,
  COMPONENT_OPTIONS,
  LIST_TYPES,
  NO_DEFAULT_TYPES,
  NUMERIC_TYPES,
  RADIO_MAX_VALUES,
  getDefaultComponent,
} from "../../constants";
import { type AttributeFormData } from "../../utils";
import ComponentTypeButton from "./ComponentTypeButton";
import RangeInput from "./RangeInput";
import ValuesList from "./ValuesList";

interface AttributeFormContentProps {
  formState: AttributeFormData;
  onFormStateChange: (state: AttributeFormData) => void;
  nameError: string | null;
}

const AttributeFormContent = ({
  formState,
  onFormStateChange,
  nameError,
}: AttributeFormContentProps) => {
  const { isEnabled: isM4Enabled } = useFeature({
    feature: FeatureFlag.VFF_ANNOTATION_M4,
  });

  const isNumericType = NUMERIC_TYPES.includes(formState.type);
  const isIntegerType =
    formState.type === "int" || formState.type === "list<int>";
  const isListType = LIST_TYPES.includes(formState.type);
  const supportsDefault = !NO_DEFAULT_TYPES.includes(formState.type);
  const componentOptions = COMPONENT_OPTIONS[formState.type] || [];

  // Handle type change - reset to default component and clear type-specific fields
  const handleTypeChange = useCallback(
    (newType: string) => {
      const newSupportsDefault = !NO_DEFAULT_TYPES.includes(newType);
      onFormStateChange({
        ...formState,
        type: newType,
        component: getDefaultComponent(newType),
        values: [],
        range: null,
        // Clear default if new type doesn't support it
        default: newSupportsDefault ? formState.default : "",
      });
    },
    [formState, onFormStateChange]
  );

  // Handle component change - reset relevant fields
  const handleComponentChange = useCallback(
    (newComponent: string) => {
      const updates: Partial<AttributeFormData> = { component: newComponent };

      // For numeric types, reset fields based on new component
      if (isNumericType) {
        if (newComponent === "text") {
          updates.values = [];
          updates.range = null;
        } else if (newComponent === "slider") {
          updates.values = [];
          if (!formState.range) {
            updates.range = { min: "", max: "" };
          }
        } else if (newComponent === "radio" || newComponent === "dropdown") {
          updates.range = null;
        }
      }

      onFormStateChange({ ...formState, ...updates });
    },
    [formState, onFormStateChange, isNumericType]
  );

  // Handle values change - auto-switch component if needed
  const handleValuesChange = useCallback(
    (newValues: string[]) => {
      let newComponent = formState.component;

      // For numeric types with radio, switch to dropdown if values > 5
      if (isNumericType && formState.component === "radio") {
        if (newValues.length > RADIO_MAX_VALUES) {
          newComponent = "dropdown";
        }
      }

      // For string type, auto-select component based on values count
      if (formState.type === "str") {
        if (newValues.length === 0) {
          newComponent = "text";
        } else if (newValues.length <= RADIO_MAX_VALUES) {
          newComponent = "radio";
        } else {
          newComponent = "dropdown";
        }
      }

      // For list types, auto-select based on values count
      if (isListType) {
        if (newValues.length <= RADIO_MAX_VALUES) {
          newComponent = "checkboxes";
        } else {
          newComponent = "dropdown";
        }
      }

      onFormStateChange({
        ...formState,
        values: newValues,
        component: newComponent,
      });
    },
    [formState, onFormStateChange, isNumericType, isListType]
  );

  // Determine what to show based on type and component
  const showComponentButtons = componentOptions.length > 1;

  // For int/float: show values only for radio/dropdown components
  const showValuesForNumeric =
    isNumericType &&
    (formState.component === "radio" || formState.component === "dropdown");

  // For str: show values for radio/dropdown
  const showValuesForStr =
    formState.type === "str" &&
    (formState.component === "radio" || formState.component === "dropdown");

  // For list types: show values for checkboxes/dropdown (not text)
  const showValuesForList =
    isListType &&
    (formState.component === "checkboxes" ||
      formState.component === "dropdown");

  const showValues =
    showValuesForNumeric || showValuesForStr || showValuesForList;

  // Show range only for int/float with slider component (not list types)
  const showRange =
    (formState.type === "int" || formState.type === "float") &&
    formState.component === "slider";

  // Validate default value is within range or values
  const getDefaultError = (): string | null => {
    if (!formState.default) return null;

    // Validate against range (for slider)
    if (showRange && formState.range) {
      const { min, max } = formState.range;
      if (min !== "" && max !== "") {
        const minNum = parseFloat(min);
        const maxNum = parseFloat(max);
        const defaultNum = parseFloat(formState.default);
        if (!isNaN(defaultNum) && minNum < maxNum) {
          if (defaultNum < minNum || defaultNum > maxNum) {
            return `Default must be between ${min} and ${max}`;
          }
        }
      }
    }

    // Validate against values (for radio/dropdown/checkboxes)
    if (showValues && formState.values.length > 0) {
      if (!formState.values.includes(formState.default)) {
        return "Default must be within provided values";
      }
    }

    return null;
  };
  const defaultError = getDefaultError();

  // Check if values are required for current component
  const valuesRequired =
    formState.component === "radio" ||
    formState.component === "dropdown" ||
    formState.component === "checkboxes";

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Lg}>
      {/* Name field */}
      <div>
        <Text
          variant={TextVariant.Md}
          color={TextColor.Secondary}
          style={{ marginBottom: 8 }}
        >
          Name
        </Text>
        <Input
          value={formState.name}
          onChange={(e) =>
            onFormStateChange({ ...formState, name: e.target.value })
          }
          placeholder="Attribute name"
          error={!!nameError}
          autoFocus
        />
        {nameError && (
          <Text
            variant={TextVariant.Sm}
            color={TextColor.Destructive}
            style={{ marginTop: 4 }}
          >
            {nameError}
          </Text>
        )}
      </div>

      {/* Attribute type dropdown */}
      <div>
        <Text
          variant={TextVariant.Md}
          color={TextColor.Secondary}
          style={{ marginBottom: 8 }}
        >
          Attribute type
        </Text>
        <Select
          exclusive
          portal
          value={formState.type}
          onChange={(value) => {
            if (typeof value === "string") {
              handleTypeChange(value);
            }
          }}
          options={ATTRIBUTE_TYPE_OPTIONS}
        />
      </div>

      {/* Component type buttons */}
      {showComponentButtons && (
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
                isSelected={formState.component === opt.id}
                onClick={() => handleComponentChange(opt.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Values list */}
      {showValues && (
        <ValuesList
          values={formState.values}
          onValuesChange={handleValuesChange}
          isNumeric={isNumericType}
          isInteger={isIntegerType}
          required={valuesRequired}
        />
      )}

      {/* Range input */}
      {showRange && (
        <RangeInput
          range={formState.range}
          onRangeChange={(range) => onFormStateChange({ ...formState, range })}
        />
      )}

      {/* Default value - only for types that support it */}
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
            value={formState.default}
            onChange={(e) =>
              onFormStateChange({ ...formState, default: e.target.value })
            }
            placeholder={isNumericType ? "Default number" : "Default value"}
            error={!!defaultError}
          />
          {defaultError && (
            <Text
              variant={TextVariant.Sm}
              color={TextColor.Destructive}
              style={{ marginTop: 4 }}
            >
              {defaultError}
            </Text>
          )}
        </div>
      )}

      {/* Read-only toggle */}
      {isM4Enabled && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <Text variant={TextVariant.Md}>Read-only</Text>
            <Toggle
              checked={formState.read_only}
              onChange={(checked) =>
                onFormStateChange({ ...formState, read_only: checked })
              }
              size={Size.Sm}
            />
          </div>
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            When enabled, annotators can view but cannot edit values.
          </Text>
        </div>
      )}
    </Stack>
  );
};

export default AttributeFormContent;
