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
import type { RichListItem } from "../../utils";
import React, { useState } from "react";
import { createRichListItem, type AttributeFormState } from "../../utils";

// Attribute type options for the dropdown
const ATTRIBUTE_TYPE_OPTIONS = [
  { id: "string_list", data: { label: "String list" } },
  { id: "text", data: { label: "Text" } },
  { id: "number", data: { label: "Number" } },
  { id: "select", data: { label: "Object selector" } },
];

// Component type options (only shown for string_list type)
const COMPONENT_TYPE_OPTIONS = [
  { id: "checkbox", data: { label: "Checkboxes", icon: IconName.Checkbox } },
  { id: "dropdown", data: { label: "Dropdown", icon: IconName.Search } },
  { id: "radio", data: { label: "Radio", icon: IconName.Radio } },
];

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
      id: `value-${index}`,
      canDrag: true,
      primaryContent: value,
      actions: (
        <Clickable
          onClick={() => handleDeleteValue(index)}
          style={{ padding: 4 }}
        >
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
        <div style={{ padding: "16px", textAlign: "center" }}>
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

  const showComponentType = formState.attributeType === "string_list";

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
          onChange={(value) => {
            if (typeof value === "string") {
              onFormStateChange({ ...formState, attributeType: value });
            }
          }}
        />
      </div>

      {/* Component type selection (only for string_list) */}
      {showComponentType && (
        <div>
          <Text
            variant={TextVariant.Md}
            color={TextColor.Secondary}
            style={{ marginBottom: 8 }}
          >
            Component type
          </Text>
          <div style={{ display: "flex", gap: 8 }}>
            {COMPONENT_TYPE_OPTIONS.map((opt) => (
              <ComponentTypeButton
                key={opt.id}
                icon={opt.data.icon}
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

      {/* Values list (only for string_list) */}
      {showComponentType && (
        <ValuesList
          values={formState.values}
          onValuesChange={(values) =>
            onFormStateChange({ ...formState, values })
          }
        />
      )}

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
