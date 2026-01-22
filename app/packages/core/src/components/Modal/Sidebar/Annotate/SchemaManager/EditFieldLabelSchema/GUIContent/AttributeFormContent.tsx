/**
 * Attribute form content component for add/edit attribute.
 * Renders the form UI - logic is in useAttributeForm hook.
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
import { ATTRIBUTE_TYPE_OPTIONS } from "../../constants";
import { type AttributeFormData } from "../../utils";
import ComponentTypeButton from "./ComponentTypeButton";
import RangeInput from "./RangeInput";
import useAttributeForm from "./useAttributeForm";
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

  const {
    // Derived state
    isNumericType,
    isIntegerType,
    supportsDefault,
    componentOptions,

    // Visibility flags
    showValues,
    showRange,

    // Validation errors
    valuesError,
    rangeError,
    defaultError,

    // Handlers
    handleNameChange,
    handleTypeChange,
    handleComponentChange,
    handleValuesChange,
    handleRangeChange,
    handleDefaultChange,
    handleReadOnlyChange,
  } = useAttributeForm({ formState, onFormStateChange });

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
      <div>
        <Text
          variant={TextVariant.Md}
          color={TextColor.Secondary}
          style={{ marginBottom: 8 }}
        >
          Input type
        </Text>
        <div style={{ display: "flex", gap: 8 }}>
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

      {/* Values list */}
      {showValues && (
        <ValuesList
          values={formState.values}
          onValuesChange={handleValuesChange}
          isNumeric={isNumericType}
          isInteger={isIntegerType}
          error={valuesError}
        />
      )}

      {/* Range input */}
      {showRange && (
        <RangeInput
          range={formState.range}
          onRangeChange={handleRangeChange}
          error={rangeError}
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
            onChange={(e) => handleDefaultChange(e.target.value)}
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
              onChange={handleReadOnlyChange}
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
