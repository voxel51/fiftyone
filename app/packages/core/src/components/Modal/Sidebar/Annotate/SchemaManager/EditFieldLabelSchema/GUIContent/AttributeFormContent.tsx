/**
 * Attribute form content component for add/edit attribute.
 * Renders the form UI - logic is in useAttributeForm hook.
 */

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
import { ATTRIBUTE_TYPE_LABELS, ATTRIBUTE_TYPE_OPTIONS } from "../../constants";
import { type AttributeFormData } from "../../utils";
import ComponentTypeButton from "./ComponentTypeButton";
import ListDefaultInput from "./ListDefaultInput";
import RangeInput from "./RangeInput";
import useAttributeForm from "./useAttributeForm";
import ValuesList from "./ValuesList";

interface AttributeFormContentProps {
  formState: AttributeFormData;
  onFormStateChange: (state: AttributeFormData) => void;
  nameError: string | null;
  /** When true, name and type are rendered as read-only text */
  isEditing?: boolean;
}

const AttributeFormContent = ({
  formState,
  onFormStateChange,
  nameError,
  isEditing = false,
}: AttributeFormContentProps) => {
  const {
    // Derived state
    isNumericType,
    isIntegerType,
    isListType,
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
    handleListDefaultChange,
    handleReadOnlyChange,
  } = useAttributeForm({ formState, onFormStateChange });

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Lg}>
      {/* Name field */}
      {isEditing ? (
        <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
          <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
            Name:
          </Text>
          <Text variant={TextVariant.Lg}>{formState.name}</Text>
        </Stack>
      ) : (
        <div>
          <Text
            variant={TextVariant.Md}
            color={TextColor.Secondary}
            style={{ marginBottom: "0.5rem" }}
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
      )}

      {/* Attribute type dropdown */}
      {isEditing ? (
        <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
          <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
            Type:
          </Text>
          <Text variant={TextVariant.Lg}>
            {ATTRIBUTE_TYPE_LABELS[formState.type] || formState.type}
          </Text>
        </Stack>
      ) : (
        <div>
          <Text
            variant={TextVariant.Md}
            color={TextColor.Secondary}
            style={{ marginBottom: "0.5rem" }}
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
      )}

      {/* Component type buttons */}
      <div>
        <Text
          variant={TextVariant.Md}
          color={TextColor.Secondary}
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
              isSelected={formState.component === opt.id}
              onClick={() => handleComponentChange(opt.id)}
            />
          ))}
        </Stack>
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
            style={{ marginBottom: "0.5rem" }}
          >
            Default (optional)
          </Text>
          {isListType ? (
            <ListDefaultInput
              values={formState.listDefault || []}
              onChange={handleListDefaultChange}
              choices={showValues ? formState.values : []}
              isNumeric={isNumericType}
              error={defaultError}
            />
          ) : (
            <>
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
            </>
          )}
        </div>
      )}

      {/* Read-only toggle */}
      <div>
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Sm}
          style={{ alignItems: "center", marginBottom: 4 }}
        >
          <Text variant={TextVariant.Md}>Read-only</Text>
          <Toggle
            checked={formState.read_only}
            onChange={handleReadOnlyChange}
            size={Size.Sm}
          />
        </Stack>
        <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
          When enabled, annotators can view but cannot edit values.
        </Text>
      </div>
    </Stack>
  );
};

export default AttributeFormContent;
