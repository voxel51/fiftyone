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
import React from "react";
import {
  ATTRIBUTE_TYPE_OPTIONS,
  COMPONENT_OPTIONS_BY_TYPE,
  RANGE_TYPES,
} from "../../../constants";
import type { AttributeFormState } from "../../../utils";
import ComponentTypeButton from "./ComponentTypeButton";
import RangeInput from "./RangeInput";
import useAttributeForm from "./useAttributeForm";
import ValuesList from "./ValuesList";

interface AttributeFormContentProps {
  formState: AttributeFormState;
  onFormStateChange: (state: AttributeFormState) => void;
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

  const {
    defaultError,
    handleTypeChange,
    handleComponentChange,
    handleNameChange,
    handleValuesChange,
    handleRangeChange,
    handleDefaultChange,
    handleDefaultBlur,
    handleReadOnlyChange,
  } = useAttributeForm({ formState, onFormStateChange });

  const componentOptions =
    COMPONENT_OPTIONS_BY_TYPE[formState.attributeType] || [];
  const showComponentType = componentOptions.length > 1;
  const showRange = RANGE_TYPES.includes(formState.attributeType);

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
          onChange={(e) => handleNameChange(e.target.value)}
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
          value={formState.attributeType}
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {componentOptions.map((opt) => (
              <ComponentTypeButton
                key={opt.id}
                icon={opt.data.icon || IconName.Edit}
                label={opt.data.label}
                isSelected={formState.componentType === opt.id}
                onClick={() => handleComponentChange(opt.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Values list */}
      <ValuesList
        values={formState.values}
        onValuesChange={handleValuesChange}
      />

      {/* Range input */}
      {showRange && (
        <RangeInput range={formState.range} onRangeChange={handleRangeChange} />
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
          value={formState.defaultValue}
          onChange={(e) => handleDefaultChange(e.target.value)}
          onBlur={handleDefaultBlur}
          placeholder="Default value"
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
              checked={formState.readOnly}
              onChange={handleReadOnlyChange}
              size={Size.Sm}
            />
          </div>
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
