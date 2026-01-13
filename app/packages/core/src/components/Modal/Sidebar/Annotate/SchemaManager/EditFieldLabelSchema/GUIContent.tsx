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
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
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
import {
  formatAttributeCount,
  getAttributeTypeLabel,
  getClassNameError,
} from "../utils";

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

// Action button for edit
const EditAction = ({ onEdit }: { onEdit: () => void }) => (
  <Clickable onClick={onEdit}>
    <Icon name={IconName.Edit} size={Size.Md} />
  </Clickable>
);

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
                secondaryContent: formatAttributeCount(attributeCount),
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
}: {
  attributes: Record<string, AttributeConfig>;
  onAddAttribute: () => void;
  onEditAttribute: (name: string) => void;
}) => {
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
          actions: <EditAction onEdit={() => onEditAttribute(name)} />,
        } as ListItemProps,
      };
    });
  }, [attributes, onEditAttribute]);

  return (
    <Section>
      <EditSectionHeader>
        <Text variant={TextVariant.Lg}>Attributes</Text>
        <Button
          size={Size.Md}
          variant={Variant.Secondary}
          onClick={onAddAttribute}
        >
          + Add attribute
        </Button>
      </EditSectionHeader>
      {listItems.length === 0 ? (
        <EmptyStateBox>
          <Text color={TextColor.Secondary}>No attributes defined</Text>
        </EmptyStateBox>
      ) : (
        <RichList listItems={listItems} draggable={false} />
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
        onAddAttribute={() => {
          // TODO: Implement add attribute
        }}
        onEditAttribute={(_name) => {
          // TODO: Implement edit attribute
        }}
      />
    </ListContainer>
  );
};

export default GUIContent;
