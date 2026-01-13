/**
 * GUI editing components for classes and attributes.
 */

import { LoadingSpinner } from "@fiftyone/components";
import {
  Button,
  Checkbox,
  Clickable,
  Icon,
  IconName,
  Input,
  Orientation,
  Pill,
  RichList,
  Select,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Toggle,
  Variant,
} from "@voxel51/voodo";
import type { ListItemProps as BaseListItemProps } from "@voxel51/voodo";
import React, { useCallback, useMemo, useState, ReactNode } from "react";
import {
  EditSectionHeader,
  EmptyStateBox,
  ListContainer,
  Section,
} from "../styled";

// Extend ListItemProps to include additionalContent (added to design-system)
interface ListItemProps extends BaseListItemProps {
  additionalContent?: ReactNode;
}

// Types
export interface AttributeConfig {
  type: string;
  values?: string[];
  readOnly?: boolean;
}

export interface ClassConfig {
  attributes?: Record<string, AttributeConfig>;
}

export interface SchemaConfigType {
  classes?: string[];
  attributes?: Record<string, AttributeConfig>;
}

// Helper functions
const getAttributeTypeLabel = (type: string): string => {
  const typeMap: Record<string, string> = {
    radio: "Radio group",
    checkbox: "Checkbox",
    dropdown: "Dropdown",
    text: "Text",
    number: "Number",
    select: "Object selector",
  };
  return typeMap[type] || type;
};

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

// Map internal type to display type
const getInternalType = (
  attributeType: string,
  componentType: string
): string => {
  if (attributeType === "string_list") {
    return componentType; // checkbox, dropdown, or radio
  }
  return attributeType; // text, number, select
};

// Map display type back to attribute type and component type
const parseAttributeType = (
  type: string
): { attributeType: string; componentType: string } => {
  if (["checkbox", "dropdown", "radio"].includes(type)) {
    return { attributeType: "string_list", componentType: type };
  }
  return { attributeType: type, componentType: "checkbox" };
};

// Action button for edit
const EditAction = ({ onEdit }: { onEdit: () => void }) => (
  <Clickable onClick={onEdit}>
    <Icon name={IconName.Edit} size={Size.Md} />
  </Clickable>
);

// Validation helper for class names
const getClassNameError = (
  name: string,
  existingClasses: string[],
  currentClass?: string
): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return "Class name cannot be empty";
  const isDuplicate = existingClasses.some(
    (c) => c !== currentClass && c === trimmed
  );
  if (isDuplicate) return "Class name already exists";
  return null;
};

// Validation helper for attribute names
const getAttributeNameError = (
  name: string,
  existingAttributes: string[],
  currentAttribute?: string
): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return "Attribute name cannot be empty";
  const isDuplicate = existingAttributes.some(
    (a) => a !== currentAttribute && a === trimmed
  );
  if (isDuplicate) return "Attribute name already exists";
  return null;
};

// Form state for attribute editing
interface AttributeFormState {
  name: string;
  attributeType: string;
  componentType: string;
  values: string[];
  readOnly: boolean;
}

const createDefaultAttributeFormState = (): AttributeFormState => ({
  name: "",
  attributeType: "string_list",
  componentType: "checkbox",
  values: [],
  readOnly: false,
});

const attributeConfigToFormState = (
  name: string,
  config: AttributeConfig
): AttributeFormState => {
  const { attributeType, componentType } = parseAttributeType(config.type);
  return {
    name,
    attributeType,
    componentType,
    values: config.values || [],
    readOnly: config.readOnly || false,
  };
};

const formStateToAttributeConfig = (
  state: AttributeFormState
): AttributeConfig => ({
  type: getInternalType(state.attributeType, state.componentType),
  values: state.values.length > 0 ? state.values : undefined,
  readOnly: state.readOnly || undefined,
});

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

  const valueListItems = values.map((value, index) => ({
    id: `value-${index}`,
    data: {
      canSelect: false,
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
    } as ListItemProps,
  }));

  const handleOrderChange = (
    newItems: { id: string; data: ListItemProps }[]
  ) => {
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

// Attribute form content component (shared between add and edit)
interface AttributeFormContentProps {
  formState: AttributeFormState;
  onFormStateChange: (state: AttributeFormState) => void;
  existingAttributes: string[];
  currentAttribute?: string;
  nameError: string | null;
}

const AttributeFormContent = ({
  formState,
  onFormStateChange,
  nameError,
}: AttributeFormContentProps) => {
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

      {/* Read-only toggle */}
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
          When enabled, annotators can view this attribute but can't edit its
          values.
        </Text>
      </div>
    </Stack>
  );
};

// Add attribute card component using RichList item style
interface AddAttributeCardProps {
  existingAttributes: string[];
  onSave: (name: string, config: AttributeConfig) => void;
  onCancel: () => void;
}

const AddAttributeCard = ({
  existingAttributes,
  onSave,
  onCancel,
}: AddAttributeCardProps) => {
  const [formState, setFormState] = useState<AttributeFormState>(
    createDefaultAttributeFormState()
  );
  const [isDirty, setIsDirty] = useState(false);

  const nameError = getAttributeNameError(formState.name, existingAttributes);
  const showError = isDirty && nameError;
  const canSave = !nameError;

  const handleFormStateChange = (newState: AttributeFormState) => {
    setFormState(newState);
    if (!isDirty) setIsDirty(true);
  };

  const handleSave = () => {
    if (canSave) {
      onSave(formState.name.trim(), formStateToAttributeConfig(formState));
    }
  };

  const listItem = {
    id: "__new_attribute__",
    data: {
      canSelect: false,
      canDrag: false,
      primaryContent: "New attribute",
      actions: (
        <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
          <Clickable onClick={onCancel} style={{ padding: 4 }}>
            <Icon name={IconName.Delete} size={Size.Md} />
          </Clickable>
          <Clickable
            onClick={handleSave}
            style={{
              padding: 4,
              opacity: canSave ? 1 : 0.5,
              cursor: canSave ? "pointer" : "not-allowed",
            }}
          >
            <Icon name={IconName.Check} size={Size.Md} />
          </Clickable>
        </Stack>
      ),
      additionalContent: (
        <AttributeFormContent
          formState={formState}
          onFormStateChange={handleFormStateChange}
          existingAttributes={existingAttributes}
          nameError={showError ? nameError : null}
        />
      ),
    } as ListItemProps,
  };

  return (
    <div style={{ marginBottom: "1rem" }}>
      <RichList listItems={[listItem]} draggable={false} />
    </div>
  );
};

// Add class card component using RichList item style
interface AddClassCardProps {
  attributeCount: number;
  existingClasses: string[];
  onSave: (name: string) => void;
  onCancel: () => void;
}

const AddClassCard = ({
  attributeCount,
  existingClasses,
  onSave,
  onCancel,
}: AddClassCardProps) => {
  const [name, setName] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  const error = getClassNameError(name, existingClasses);
  const showError = isDirty && error;
  const canSave = !error;

  const handleSave = () => {
    if (canSave) {
      onSave(name.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canSave) {
      e.preventDefault();
      handleSave();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    if (!isDirty) setIsDirty(true);
  };

  const listItem = {
    id: "__new__",
    data: {
      canSelect: false,
      canDrag: false,
      primaryContent: "New class",
      actions: (
        <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
          <Clickable onClick={onCancel} style={{ padding: 4 }}>
            <Icon name={IconName.Delete} size={Size.Md} />
          </Clickable>
          <Clickable
            onClick={handleSave}
            style={{
              padding: 4,
              opacity: canSave ? 1 : 0.5,
              cursor: canSave ? "pointer" : "not-allowed",
            }}
          >
            <Icon name={IconName.Check} size={Size.Md} />
          </Clickable>
        </Stack>
      ),
      additionalContent: (
        <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
          <div>
            <Input
              value={name}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Class name"
              error={!!showError}
              autoFocus
            />
            {showError && (
              <Text
                variant={TextVariant.Md}
                color={TextColor.Destructive}
                style={{ marginTop: 4 }}
              >
                {error}
              </Text>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Checkbox size={Size.Md} checked={true} disabled />
            <Text variant={TextVariant.Md} color={TextColor.Secondary}>
              Include all {attributeCount} attributes
            </Text>
          </div>
        </Stack>
      ),
    } as ListItemProps,
  };

  return (
    <div style={{ marginBottom: "1rem" }}>
      <RichList listItems={[listItem]} draggable={false} />
    </div>
  );
};

// Expanded content for inline class editing (Name input + Include checkbox)
const InlineEditExpandedContent = ({
  name,
  onNameChange,
  attributeCount,
  error,
  onSave,
}: {
  name: string;
  onNameChange: (name: string) => void;
  attributeCount: number;
  error: string | null;
  onSave: () => void;
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !error) {
      e.preventDefault();
      onSave();
    }
  };

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
      <div>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Class name"
          error={!!error}
          autoFocus
        />
        {error && (
          <Text
            variant={TextVariant.Md}
            color={TextColor.Destructive}
            style={{ marginTop: 4 }}
          >
            {error}
          </Text>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Checkbox size={Size.Md} checked={true} disabled />
        <Text variant={TextVariant.Md} color={TextColor.Secondary}>
          Include all {attributeCount} attributes
        </Text>
      </div>
    </Stack>
  );
};

// Classes section component
export const ClassesSection = ({
  classes,
  attributeCount,
  onAddClass,
  onEditClass,
  onDeleteClass,
  onOrderChange,
}: {
  classes: string[];
  attributeCount: number;
  onAddClass: (name: string) => void;
  onEditClass: (oldName: string, newName: string) => void;
  onDeleteClass: (name: string) => void;
  onOrderChange?: (newOrder: string[]) => void;
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingClass, setEditingClass] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const editError = editingClass
    ? getClassNameError(editingName, classes, editingClass)
    : null;

  const handleAddSave = useCallback(
    (name: string) => {
      onAddClass(name);
      setIsAdding(false);
    },
    [onAddClass]
  );

  const handleStartEdit = useCallback((name: string) => {
    setEditingClass(name);
    setEditingName(name);
  }, []);

  const handleEditSave = useCallback(() => {
    if (!editingClass || editError) return;
    onEditClass(editingClass, editingName.trim());
    setEditingClass(null);
    setEditingName("");
  }, [editingClass, editingName, editError, onEditClass]);

  const handleDeleteClass = useCallback(() => {
    if (editingClass) {
      onDeleteClass(editingClass);
      setEditingClass(null);
      setEditingName("");
    }
  }, [editingClass, onDeleteClass]);

  const listItems = useMemo(
    () =>
      classes.map((name) => ({
        id: name,
        data:
          name === editingClass
            ? ({
                canSelect: false,
                canDrag: true,
                primaryContent: "Edit class",
                actions: (
                  <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
                    <Clickable
                      onClick={handleDeleteClass}
                      style={{ padding: 4 }}
                    >
                      <Icon name={IconName.Delete} size={Size.Md} />
                    </Clickable>
                    <Clickable
                      onClick={handleEditSave}
                      style={{
                        padding: 4,
                        opacity: editError ? 0.5 : 1,
                        cursor: editError ? "not-allowed" : "pointer",
                      }}
                    >
                      <Icon name={IconName.Check} size={Size.Md} />
                    </Clickable>
                  </Stack>
                ),
                additionalContent: (
                  <InlineEditExpandedContent
                    name={editingName}
                    onNameChange={setEditingName}
                    attributeCount={attributeCount}
                    error={editError}
                    onSave={handleEditSave}
                  />
                ),
              } as ListItemProps)
            : ({
                canSelect: false,
                canDrag: true,
                primaryContent: name,
                secondaryContent: `${attributeCount} attribute${
                  attributeCount !== 1 ? "s" : ""
                }`,
                actions: <EditAction onEdit={() => handleStartEdit(name)} />,
              } as ListItemProps),
      })),
    [
      classes,
      attributeCount,
      editingClass,
      editingName,
      editError,
      handleEditSave,
      handleDeleteClass,
      handleStartEdit,
    ]
  );

  const handleOrderChange = useCallback(
    (newItems: { id: string; data: ListItemProps }[]) => {
      const newOrder = newItems.map((item) => item.id);
      onOrderChange?.(newOrder);
    },
    [onOrderChange]
  );

  return (
    <Section>
      <EditSectionHeader>
        <Text variant={TextVariant.Lg}>Classes</Text>
        <Button
          size={Size.Md}
          variant={Variant.Secondary}
          onClick={() => setIsAdding(true)}
          disabled={isAdding || editingClass !== null}
        >
          + Add class
        </Button>
      </EditSectionHeader>

      {/* Add new class card */}
      {isAdding && (
        <AddClassCard
          attributeCount={attributeCount}
          existingClasses={classes}
          onSave={handleAddSave}
          onCancel={() => setIsAdding(false)}
        />
      )}

      {classes.length === 0 && !isAdding ? (
        <EmptyStateBox>
          <Text color={TextColor.Secondary}>No classes defined</Text>
        </EmptyStateBox>
      ) : (
        classes.length > 0 && (
          <RichList
            listItems={listItems}
            draggable={true}
            onOrderChange={handleOrderChange}
          />
        )
      )}
    </Section>
  );
};

// Attributes section component
export const AttributesSection = ({
  attributes,
  onAddAttribute,
  onEditAttribute,
  onDeleteAttribute,
}: {
  attributes: Record<string, AttributeConfig>;
  onAddAttribute: (name: string, config: AttributeConfig) => void;
  onEditAttribute: (
    oldName: string,
    newName: string,
    config: AttributeConfig
  ) => void;
  onDeleteAttribute: (name: string) => void;
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<string | null>(null);
  const [editingFormState, setEditingFormState] =
    useState<AttributeFormState | null>(null);

  const existingAttributeNames = useMemo(
    () => Object.keys(attributes),
    [attributes]
  );

  const editError =
    editingAttribute && editingFormState
      ? getAttributeNameError(
          editingFormState.name,
          existingAttributeNames,
          editingAttribute
        )
      : null;

  const handleAddSave = useCallback(
    (name: string, config: AttributeConfig) => {
      onAddAttribute(name, config);
      setIsAdding(false);
    },
    [onAddAttribute]
  );

  const handleStartEdit = useCallback(
    (name: string) => {
      const config = attributes[name];
      if (config) {
        setEditingAttribute(name);
        setEditingFormState(attributeConfigToFormState(name, config));
      }
    },
    [attributes]
  );

  const handleEditSave = useCallback(() => {
    if (!editingAttribute || !editingFormState || editError) return;
    onEditAttribute(
      editingAttribute,
      editingFormState.name.trim(),
      formStateToAttributeConfig(editingFormState)
    );
    setEditingAttribute(null);
    setEditingFormState(null);
  }, [editingAttribute, editingFormState, editError, onEditAttribute]);

  const handleDeleteAttribute = useCallback(() => {
    if (editingAttribute) {
      onDeleteAttribute(editingAttribute);
      setEditingAttribute(null);
      setEditingFormState(null);
    }
  }, [editingAttribute, onDeleteAttribute]);

  const handleCancelEdit = useCallback(() => {
    setEditingAttribute(null);
    setEditingFormState(null);
  }, []);

  const listItems = useMemo(() => {
    const attrEntries = Object.entries(attributes);
    return attrEntries.map(([name, config]) => {
      const typeLabel = getAttributeTypeLabel(config.type);
      const optionCount = config.values?.length;
      const secondaryParts = [typeLabel];
      if (optionCount !== undefined) {
        secondaryParts.push(
          `${optionCount} option${optionCount !== 1 ? "s" : ""}`
        );
      }

      if (name === editingAttribute && editingFormState) {
        return {
          id: name,
          data: {
            canSelect: false,
            canDrag: false,
            primaryContent: "Edit attribute",
            actions: (
              <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
                <Clickable
                  onClick={handleDeleteAttribute}
                  style={{ padding: 4 }}
                >
                  <Icon name={IconName.Delete} size={Size.Md} />
                </Clickable>
                <Clickable
                  onClick={handleEditSave}
                  style={{
                    padding: 4,
                    opacity: editError ? 0.5 : 1,
                    cursor: editError ? "not-allowed" : "pointer",
                  }}
                >
                  <Icon name={IconName.Check} size={Size.Md} />
                </Clickable>
              </Stack>
            ),
            additionalContent: (
              <AttributeFormContent
                formState={editingFormState}
                onFormStateChange={setEditingFormState}
                existingAttributes={existingAttributeNames}
                currentAttribute={editingAttribute}
                nameError={editError}
              />
            ),
          } as ListItemProps,
        };
      }

      return {
        id: name,
        data: {
          canSelect: false,
          canDrag: false,
          primaryContent: name,
          secondaryContent: (
            <>
              {secondaryParts.join(" · ")}
              {config.readOnly && (
                <Pill size={Size.Md} style={{ marginLeft: 8 }}>
                  Read-only
                </Pill>
              )}
            </>
          ),
          actions: (
            <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
              <Clickable
                onClick={() => {
                  onDeleteAttribute(name);
                }}
                style={{ padding: 4 }}
              >
                <Icon name={IconName.Delete} size={Size.Md} />
              </Clickable>
              <EditAction onEdit={() => handleStartEdit(name)} />
            </Stack>
          ),
        } as ListItemProps,
      };
    });
  }, [
    attributes,
    editingAttribute,
    editingFormState,
    editError,
    existingAttributeNames,
    handleDeleteAttribute,
    handleEditSave,
    handleStartEdit,
    onDeleteAttribute,
  ]);

  return (
    <Section>
      <EditSectionHeader>
        <Text variant={TextVariant.Lg}>Attributes</Text>
        <Button
          size={Size.Md}
          variant={Variant.Secondary}
          onClick={() => setIsAdding(true)}
          disabled={isAdding || editingAttribute !== null}
        >
          + Add attribute
        </Button>
      </EditSectionHeader>

      {/* Add new attribute card */}
      {isAdding && (
        <AddAttributeCard
          existingAttributes={existingAttributeNames}
          onSave={handleAddSave}
          onCancel={() => setIsAdding(false)}
        />
      )}

      {listItems.length === 0 && !isAdding ? (
        <EmptyStateBox>
          <Text color={TextColor.Secondary}>No attributes defined</Text>
        </EmptyStateBox>
      ) : (
        listItems.length > 0 && (
          <RichList listItems={listItems} draggable={false} />
        )
      )}
    </Section>
  );
};

// Main GUI View component for editing field schema
interface GUIContentProps {
  config: SchemaConfigType | undefined;
  scanning: boolean;
  onConfigChange?: (config: SchemaConfigType) => void;
}

const GUIContent = ({ config, scanning, onConfigChange }: GUIContentProps) => {
  const classes = useMemo(() => config?.classes || [], [config?.classes]);
  const attributes = useMemo(
    () => config?.attributes || {},
    [config?.attributes]
  );

  const handleAddClass = useCallback(
    (name: string) => {
      if (!config) return;
      const newClasses = [name, ...classes];
      onConfigChange?.({ ...config, classes: newClasses });
    },
    [config, classes, onConfigChange]
  );

  const handleEditClass = useCallback(
    (oldName: string, newName: string) => {
      if (!config) return;
      const newClasses = classes.map((c) => (c === oldName ? newName : c));
      onConfigChange?.({ ...config, classes: newClasses });
    },
    [config, classes, onConfigChange]
  );

  const handleDeleteClass = useCallback(
    (name: string) => {
      if (!config) return;
      const newClasses = classes.filter((c) => c !== name);
      onConfigChange?.({ ...config, classes: newClasses });
    },
    [config, classes, onConfigChange]
  );

  const handleClassOrderChange = useCallback(
    (newOrder: string[]) => {
      if (!config) return;
      onConfigChange?.({ ...config, classes: newOrder });
    },
    [config, onConfigChange]
  );

  const handleAddAttribute = useCallback(
    (name: string, attrConfig: AttributeConfig) => {
      if (!config) return;
      const newAttributes = { [name]: attrConfig, ...attributes };
      onConfigChange?.({ ...config, attributes: newAttributes });
    },
    [config, attributes, onConfigChange]
  );

  const handleEditAttribute = useCallback(
    (oldName: string, newName: string, attrConfig: AttributeConfig) => {
      if (!config) return;
      const newAttributes = { ...attributes };
      // If name changed, remove old key
      if (oldName !== newName) {
        delete newAttributes[oldName];
      }
      newAttributes[newName] = attrConfig;
      onConfigChange?.({ ...config, attributes: newAttributes });
    },
    [config, attributes, onConfigChange]
  );

  const handleDeleteAttribute = useCallback(
    (name: string) => {
      if (!config) return;
      const newAttributes = { ...attributes };
      delete newAttributes[name];
      onConfigChange?.({ ...config, attributes: newAttributes });
    },
    [config, attributes, onConfigChange]
  );

  if (scanning) {
    return (
      <ListContainer>
        <Section>
          <EditSectionHeader>
            <Text variant={TextVariant.Lg}>Classes</Text>
          </EditSectionHeader>
          <EmptyStateBox>
            <LoadingSpinner style={{ marginRight: 8 }} />
            <Text color={TextColor.Secondary}>Scanning schema</Text>
          </EmptyStateBox>
        </Section>
        <Section>
          <EditSectionHeader>
            <Text variant={TextVariant.Lg}>Attributes</Text>
          </EditSectionHeader>
          <EmptyStateBox>
            <LoadingSpinner style={{ marginRight: 8 }} />
            <Text color={TextColor.Secondary}>Scanning schema</Text>
          </EmptyStateBox>
        </Section>
      </ListContainer>
    );
  }

  return (
    <ListContainer>
      <ClassesSection
        classes={classes}
        attributeCount={Object.keys(attributes).length}
        onAddClass={handleAddClass}
        onEditClass={handleEditClass}
        onDeleteClass={handleDeleteClass}
        onOrderChange={handleClassOrderChange}
      />
      <AttributesSection
        attributes={attributes}
        onAddAttribute={handleAddAttribute}
        onEditAttribute={handleEditAttribute}
        onDeleteAttribute={handleDeleteAttribute}
      />
    </ListContainer>
  );
};

export default GUIContent;
