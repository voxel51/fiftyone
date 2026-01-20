/**
 * Attribute form content component for add/edit attribute.
 */

import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
import {
  Clickable,
  Icon,
  IconName,
  Input,
  Orientation,
  RichList,
  Select,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Toggle,
} from "@voxel51/voodo";
import React, { useCallback, useState } from "react";
import {
  ATTRIBUTE_TYPE_OPTIONS,
  COMPONENT_OPTIONS,
  NUMERIC_TYPES,
  RADIO_MAX_VALUES,
  getDefaultComponent,
} from "../../constants";
import {
  createRichListItem,
  type AttributeFormData,
  type RichListItem,
} from "../../utils";

// =============================================================================
// Sub-components
// =============================================================================

interface ComponentTypeButtonProps {
  icon?: IconName;
  label: string;
  isSelected: boolean;
  onClick: () => void;
}

const ComponentTypeButton = ({
  icon,
  label,
  isSelected,
  onClick,
}: ComponentTypeButtonProps) => (
  <Clickable onClick={onClick}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 6,
        border: isSelected
          ? "1px solid var(--fo-palette-primary-main, #FF6D04)"
          : "1px solid var(--fo-palette-divider, #333)",
        backgroundColor: isSelected ? "rgba(255, 109, 4, 0.1)" : "transparent",
        cursor: "pointer",
        minWidth: 80,
      }}
    >
      {icon && (
        <Icon
          name={icon}
          size={Size.Md}
          color={isSelected ? "#FF6D04" : undefined}
        />
      )}
      <Text variant={TextVariant.Md}>{label}</Text>
    </div>
  </Clickable>
);

interface ValuesListProps {
  values: string[];
  onValuesChange: (values: string[]) => void;
  isNumeric?: boolean;
  isInteger?: boolean;
}

const ValuesList = ({
  values,
  onValuesChange,
  isNumeric = false,
  isInteger = false,
}: ValuesListProps) => {
  const [newValue, setNewValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const validateValue = (val: string): string | null => {
    if (!val.trim()) return null;
    if (isNumeric) {
      const num = parseFloat(val);
      if (isNaN(num)) return "Must be a number";
      if (isInteger && !Number.isInteger(num)) return "Must be an integer";
    }
    if (values.includes(val.trim())) return "Value already exists";
    return null;
  };

  const handleAddValue = () => {
    const trimmed = newValue.trim();
    const validationError = validateValue(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (trimmed) {
      onValuesChange([...values, trimmed]);
      setNewValue("");
      setError(null);
    }
  };

  const handleDeleteValue = (index: number) => {
    const newValues = values.filter((_, i) => i !== index);
    onValuesChange(newValues);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddValue();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewValue(e.target.value);
    setError(null);
  };

  const valueListItems = values.map((value, index) =>
    createRichListItem({
      id: `value-${index}`,
      canDrag: true,
      primaryContent: value,
      actions: (
        <Clickable onClick={() => handleDeleteValue(index)}>
          <Icon name={IconName.Delete} size={Size.Md} />
        </Clickable>
      ),
    })
  );

  const handleOrderChange = (newItems: RichListItem[]) => {
    const newValues = newItems.map(
      (item) => item.data.primaryContent as string
    );
    onValuesChange(newValues);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <Text variant={TextVariant.Md} color={TextColor.Secondary}>
          Values {isNumeric && "(required)"}
        </Text>
        <Clickable onClick={handleAddValue}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Icon name={IconName.Add} size={Size.Sm} />
            <Text variant={TextVariant.Sm}>Add</Text>
          </div>
        </Clickable>
      </div>
      <Input
        type={isNumeric ? "number" : "text"}
        value={newValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={isNumeric ? "Enter a number" : "Enter a value"}
        error={!!error}
      />
      {error && (
        <Text
          variant={TextVariant.Sm}
          color={TextColor.Destructive}
          style={{ marginTop: 4 }}
        >
          {error}
        </Text>
      )}
      {values.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <RichList
            listItems={valueListItems}
            draggable={true}
            onOrderChange={handleOrderChange}
          />
        </div>
      )}
    </div>
  );
};

interface RangeInputProps {
  range: { min: string; max: string } | null;
  onRangeChange: (range: { min: string; max: string } | null) => void;
}

const RangeInput = ({ range, onRangeChange }: RangeInputProps) => {
  const min = range?.min || "";
  const max = range?.max || "";

  const hasError =
    min !== "" && max !== "" && parseFloat(min) >= parseFloat(max);

  return (
    <div>
      <Text
        variant={TextVariant.Md}
        color={TextColor.Secondary}
        style={{ marginBottom: 8 }}
      >
        Range (required)
      </Text>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Input
          type="number"
          value={min}
          onChange={(e) =>
            onRangeChange({ min: e.target.value, max: max || "100" })
          }
          placeholder="Min"
          style={{ flex: 1 }}
          error={hasError}
        />
        <Text variant={TextVariant.Md} color={TextColor.Secondary}>
          to
        </Text>
        <Input
          type="number"
          value={max}
          onChange={(e) =>
            onRangeChange({ min: min || "0", max: e.target.value })
          }
          placeholder="Max"
          style={{ flex: 1 }}
          error={hasError}
        />
      </div>
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

// =============================================================================
// Main Component
// =============================================================================

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
  const isIntegerType = formState.type === "int";
  const componentOptions = COMPONENT_OPTIONS[formState.type] || [];

  // Handle type change - reset to default component
  const handleTypeChange = useCallback(
    (newType: string) => {
      onFormStateChange({
        ...formState,
        type: newType,
        component: getDefaultComponent(newType),
        values: [],
        range: null,
      });
    },
    [formState, onFormStateChange]
  );

  // Handle component change
  const handleComponentChange = useCallback(
    (newComponent: string) => {
      // Reset fields based on new component
      const updates: Partial<AttributeFormData> = { component: newComponent };

      if (isNumericType) {
        if (newComponent === "text") {
          updates.values = [];
          updates.range = null;
        } else if (newComponent === "slider") {
          updates.values = [];
          // Keep range if exists, otherwise init with defaults
          if (!formState.range) {
            updates.range = { min: "0", max: "100" };
          }
        } else if (newComponent === "radio" || newComponent === "dropdown") {
          updates.range = null;
          // Keep values
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

      // For string type, auto-select component
      if (formState.type === "str") {
        if (newValues.length === 0) {
          newComponent = "text";
        } else if (newValues.length <= RADIO_MAX_VALUES) {
          newComponent = "radio";
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
    [formState, onFormStateChange, isNumericType]
  );

  // Determine what to show based on type and component
  const showComponentButtons = componentOptions.length > 1;
  const showValues =
    formState.type === "str" ||
    formState.type === "list<str>" ||
    (isNumericType &&
      (formState.component === "radio" || formState.component === "dropdown"));
  const showRange = isNumericType && formState.component === "slider";

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
        />
      )}

      {/* Range input */}
      {showRange && (
        <RangeInput
          range={formState.range}
          onRangeChange={(range) => onFormStateChange({ ...formState, range })}
        />
      )}

      {/* Default value */}
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
        />
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
