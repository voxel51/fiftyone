/**
 * Attribute form content component (shared between add and edit).
 */

import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
import {
  IconName,
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
import { useState } from "react";
import {
  ATTRIBUTE_TYPE_OPTIONS,
  COMPONENT_OPTIONS_BY_TYPE,
  NO_VALUES_TYPES,
  NUMBER_TYPES,
  RANGE_TYPES,
  getDefaultComponent,
} from "../../../constants";
import { ComponentButtonsContainer, FormFieldRow } from "../../../styled";
import type { AttributeFormData } from "../../../utils";
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

  const [defaultTouched, setDefaultTouched] = useState(false);

  // Default validation - must be one of values if values are provided
  const values = formState.values ?? [];
  const defaultValue = formState.default ?? "";
  const hasDefaultValue = defaultValue !== "";
  const defaultError =
    defaultTouched &&
    values.length > 0 &&
    hasDefaultValue &&
    !values.includes(defaultValue);

  // Handlers with logic (auto-select component)
  const handleTypeChange = (newType: string) => {
    onFormStateChange({
      ...formState,
      type: newType,
      component: getDefaultComponent(newType, 0, false),
      values: [],
      range: undefined,
    });
  };

  const handleValuesChange = (newValues: string[]) => {
    onFormStateChange({
      ...formState,
      values: newValues,
      component: getDefaultComponent(
        formState.type,
        newValues.length,
        formState.range !== undefined
      ),
    });
  };

  const handleRangeChange = (min: number | null, max: number | null) => {
    const newRange: [number, number] | undefined =
      min !== null || max !== null ? [min ?? 0, max ?? 100] : undefined;
    onFormStateChange({
      ...formState,
      range: newRange,
      component: getDefaultComponent(
        formState.type,
        values.length,
        newRange !== undefined
      ),
    });
  };

  const componentOptions = COMPONENT_OPTIONS_BY_TYPE[formState.type] || [];
  const showComponentType = componentOptions.length > 1;
  const showValues = !NO_VALUES_TYPES.includes(formState.type);
  const showRange = RANGE_TYPES.includes(formState.type);
  const isNumericType = NUMBER_TYPES.includes(formState.type);

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
            variant={TextVariant.Md}
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
          options={ATTRIBUTE_TYPE_OPTIONS}
          value={formState.type}
          exclusive
          portal
          fullWidth
          onChange={(value) => {
            if (typeof value === "string") {
              handleTypeChange(value);
            }
          }}
        />
      </div>

      {/* Component type selection */}
      {showComponentType && (
        <div>
          <Text
            variant={TextVariant.Md}
            color={TextColor.Secondary}
            style={{ marginBottom: 8 }}
          >
            Component type
          </Text>
          <ComponentButtonsContainer>
            {componentOptions.map((opt) => (
              <ComponentTypeButton
                key={opt.id}
                icon={opt.data.icon || IconName.Edit}
                label={opt.data.label}
                isSelected={formState.component === opt.id}
                onClick={() =>
                  onFormStateChange({ ...formState, component: opt.id })
                }
              />
            ))}
          </ComponentButtonsContainer>
        </div>
      )}

      {/* Values list */}
      {showValues && (
        <ValuesList
          values={values}
          onValuesChange={handleValuesChange}
          isNumeric={isNumericType}
        />
      )}

      {/* Range input */}
      {showRange && (
        <RangeInput
          range={formState.range ?? null}
          onRangeChange={handleRangeChange}
        />
      )}

      {/* Default value input */}
      <div>
        <Text
          variant={TextVariant.Md}
          color={TextColor.Secondary}
          style={{ marginBottom: 8 }}
        >
          Default
        </Text>
        <Input
          type={isNumericType ? "number" : "text"}
          value={defaultValue}
          onChange={(e) =>
            onFormStateChange({ ...formState, default: e.target.value })
          }
          onBlur={() => setDefaultTouched(true)}
          placeholder={isNumericType ? "Default number" : "Default value"}
          error={defaultError}
        />
        {defaultError && (
          <Text
            variant={TextVariant.Sm}
            color={TextColor.Destructive}
            style={{ marginTop: 4 }}
          >
            Default must be one of the defined values
          </Text>
        )}
      </div>

      {/* Read-only toggle */}
      {isM4Enabled && (
        <div>
          <FormFieldRow style={{ marginBottom: 4 }}>
            <Text variant={TextVariant.Md}>Read-only</Text>
            <Toggle
              checked={formState.read_only ?? false}
              onChange={(read_only) =>
                onFormStateChange({ ...formState, read_only })
              }
              size={Size.Sm}
            />
          </FormFieldRow>
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            When enabled, annotators can view this attribute but cannot edit its
            values.
          </Text>
        </div>
      )}
    </Stack>
  );
};

export default AttributeFormContent;
