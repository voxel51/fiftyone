/**
 * Attribute form content component (shared between add and edit).
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
import React, { useState } from "react";
import {
  ATTRIBUTE_TYPE_OPTIONS,
  COMPONENT_OPTIONS_BY_TYPE,
  LIST_TYPES,
  RANGE_TYPES,
  getDefaultComponent,
} from "../../constants";
import { createRichListItem, type AttributeFormState } from "../../utils";
import type { RichListItem } from "../../utils";

// Component type button for attribute form
interface ComponentTypeButtonProps {
  icon: IconName;
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
        minWidth: 100,
      }}
    >
      <Icon
        name={icon}
        size={Size.Md}
        color={isSelected ? "#FF6D04" : undefined}
      />
      <Text variant={TextVariant.Md}>{label}</Text>
    </div>
  </Clickable>
);

// Values list component for attribute editing
interface ValuesListProps {
  values: string[];
  onValuesChange: (values: string[]) => void;
}

const ValuesList = ({ values, onValuesChange }: ValuesListProps) => {
  const [newValue, setNewValue] = useState("");

  const handleAddValue = () => {
    const trimmed = newValue.trim();
    if (trimmed && !values.includes(trimmed)) {
      onValuesChange([...values, trimmed]);
      setNewValue("");
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

  const valueListItems = values.map((value, index) =>
    createRichListItem({
      id: `values-${index}`,
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
    const newValues = newItems.map((item) => {
      const index = parseInt(item.id.replace("value-", ""), 10);
      return values[index];
    });
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
          Values
        </Text>
        <Clickable
          onClick={handleAddValue}
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          <Icon name={IconName.Add} size={Size.Sm} />
          <Text variant={TextVariant.Sm}>Add value</Text>
        </Clickable>
      </div>
      {values.length === 0 ? (
        <div style={{ textAlign: "center" }}>
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter a value and press Enter"
          />
          {values.length === 0 && !newValue && (
            <Text
              variant={TextVariant.Sm}
              color={TextColor.Secondary}
              style={{ marginTop: 8 }}
            >
              No values yet
            </Text>
          )}
        </div>
      ) : (
        <>
          <RichList
            listItems={valueListItems}
            draggable={true}
            onOrderChange={handleOrderChange}
            style={{ gap: 8 }}
          />
          <div style={{ marginTop: 8 }}>
            <Input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add another value"
            />
          </div>
        </>
      )}
    </div>
  );
};

// Main form content props
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

  // Get component options for the selected type
  const componentOptions =
    COMPONENT_OPTIONS_BY_TYPE[formState.attributeType] || [];
  const showComponentType = componentOptions.length > 1;

  // When type changes, reset component to appropriate default
  const handleTypeChange = (newType: string) => {
    const defaultComponent = getDefaultComponent(newType, 0, false);
    onFormStateChange({
      ...formState,
      attributeType: newType,
      componentType: defaultComponent,
      values: [], // Reset values when type changes
      range: null, // Reset range when type changes
    });
  };

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

      {/* Component type selection (when multiple options available) */}
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
                onClick={() =>
                  onFormStateChange({ ...formState, componentType: opt.id })
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Values list */}
      <ValuesList
        values={formState.values}
        onValuesChange={(values) => {
          const hasRange = formState.range !== null;
          const newComponent = getDefaultComponent(
            formState.attributeType,
            values.length,
            hasRange
          );
          onFormStateChange({
            ...formState,
            values,
            componentType: newComponent,
          });
        }}
      />

      {/* Range input (for int and float types) */}
      {RANGE_TYPES.includes(formState.attributeType) && (
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
                value={formState.range?.[0]?.toString() ?? ""}
                onChange={(e) => {
                  const min = e.target.value ? Number(e.target.value) : null;
                  const max = formState.range?.[1] ?? null;
                  const newRange: [number, number] | null =
                    min !== null || max !== null
                      ? [min ?? 0, max ?? 100]
                      : null;
                  const newComponent = getDefaultComponent(
                    formState.attributeType,
                    formState.values.length,
                    newRange !== null
                  );
                  onFormStateChange({
                    ...formState,
                    range: newRange,
                    componentType: newComponent,
                  });
                }}
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
                value={formState.range?.[1]?.toString() ?? ""}
                onChange={(e) => {
                  const min = formState.range?.[0] ?? null;
                  const max = e.target.value ? Number(e.target.value) : null;
                  const newRange: [number, number] | null =
                    min !== null || max !== null
                      ? [min ?? 0, max ?? 100]
                      : null;
                  const newComponent = getDefaultComponent(
                    formState.attributeType,
                    formState.values.length,
                    newRange !== null
                  );
                  onFormStateChange({
                    ...formState,
                    range: newRange,
                    componentType: newComponent,
                  });
                }}
                placeholder="100"
                style={{ width: 80 }}
              />
            </div>
          </div>
        </div>
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
          onChange={(e) =>
            onFormStateChange({ ...formState, defaultValue: e.target.value })
          }
          placeholder="Default value"
        />
      </div>

      {/* Read-only toggle (only when M4 flag enabled) */}
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
              onChange={(checked) =>
                onFormStateChange({ ...formState, readOnly: checked })
              }
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
