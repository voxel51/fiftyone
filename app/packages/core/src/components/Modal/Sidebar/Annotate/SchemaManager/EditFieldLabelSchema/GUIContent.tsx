/**
 * GUI editing components for classes and attributes.
 */

import { LoadingSpinner } from "@fiftyone/components";
import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
} from "@mui/icons-material";
import {
  Button,
  Checkbox,
  Clickable,
  Input,
  Pill,
  RichList,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import type { ListItemProps } from "@voxel51/voodo";
import React, { useCallback, useMemo, useState } from "react";
import styled from "styled-components";
import {
  EditSectionHeader,
  EmptyStateBox,
  ListContainer,
  Section,
} from "../styled";

// Styled components for edit card
const EditCardContainer = styled.div`
  background: ${({ theme }) => theme.background.level1};
  border-radius: 4px;
  padding: 1rem;
  margin-bottom: 0.5rem;
`;

const EditCardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
`;

const EditCardActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const EditCardField = styled.div`
  margin-bottom: 1rem;
`;

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

// Action button for edit
const EditAction = ({ onEdit }: { onEdit: () => void }) => (
  <Clickable onClick={onEdit} style={{ padding: 4, height: 29, width: 29 }}>
    <EditOutlined fontSize="small" />
  </Clickable>
);

// Edit/Add class card component
interface EditClassCardProps {
  mode: "add" | "edit";
  initialName?: string;
  attributeCount: number;
  onSave: (name: string) => void;
  onCancel: () => void;
}

const EditClassCard = ({
  mode,
  initialName = "",
  attributeCount,
  onSave,
  onCancel,
}: EditClassCardProps) => {
  const [name, setName] = useState(initialName);

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim());
    }
  };

  return (
    <EditCardContainer>
      <EditCardHeader>
        <Text variant={TextVariant.Lg}>
          {mode === "add" ? "New class" : "Edit class"}
        </Text>
        <EditCardActions>
          <Clickable onClick={onCancel} style={{ padding: 4 }}>
            <DeleteOutlined fontSize="small" />
          </Clickable>
          <Clickable onClick={handleSave} style={{ padding: 4 }}>
            <CheckOutlined fontSize="small" />
          </Clickable>
        </EditCardActions>
      </EditCardHeader>
      <EditCardField>
        <Text
          variant={TextVariant.Lg}
          color={TextColor.Secondary}
          style={{ marginBottom: 8, display: "block" }}
        >
          Name
        </Text>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Class name"
          autoFocus
        />
      </EditCardField>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Checkbox size={Size.Sm} checked={false} disabled />
        <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
          Include all {attributeCount} attributes
        </Text>
      </div>
    </EditCardContainer>
  );
};

// Inline edit card for use inside RichList
const InlineEditClassCard = ({
  initialName,
  attributeCount,
  onSave,
  onCancel,
}: {
  initialName: string;
  attributeCount: number;
  onSave: (name: string) => void;
  onCancel: () => void;
}) => {
  const [name, setName] = useState(initialName);

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim());
    }
  };

  return (
    <div style={{ width: "100%", padding: "0.5rem 0", flex: 1 }}>
      <EditCardHeader style={{ marginBottom: "0.75rem" }}>
        <Text variant={TextVariant.Lg}>Edit class: {initialName}</Text>
        <EditCardActions>
          <Clickable onClick={onCancel} style={{ padding: 4 }}>
            <DeleteOutlined fontSize="small" />
          </Clickable>
          <Clickable onClick={handleSave} style={{ padding: 4 }}>
            <CheckOutlined fontSize="small" />
          </Clickable>
        </EditCardActions>
      </EditCardHeader>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Class name"
        autoFocus
        style={{ marginBottom: "0.75rem" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Checkbox size={Size.Sm} checked={false} disabled />
        <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
          Apply all {attributeCount} attributes
        </Text>
      </div>
    </div>
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

  const handleAddSave = (name: string) => {
    onAddClass(name);
    setIsAdding(false);
  };

  const handleEditSave = useCallback(
    (newName: string) => {
      if (editingClass) {
        onEditClass(editingClass, newName);
        setEditingClass(null);
      }
    },
    [editingClass, onEditClass]
  );

  const handleEditCancel = useCallback(() => {
    if (editingClass) {
      onDeleteClass(editingClass);
      setEditingClass(null);
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
                primaryContent: (
                  <InlineEditClassCard
                    initialName={name}
                    attributeCount={attributeCount}
                    onSave={handleEditSave}
                    onCancel={handleEditCancel}
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
                actions: <EditAction onEdit={() => setEditingClass(name)} />,
              } as ListItemProps),
      })),
    [classes, attributeCount, editingClass, handleEditSave, handleEditCancel]
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
          size={Size.Sm}
          variant={Variant.Secondary}
          onClick={() => setIsAdding(true)}
          disabled={isAdding || editingClass !== null}
        >
          + Add class
        </Button>
      </EditSectionHeader>

      {/* Add new class card */}
      {isAdding && (
        <EditClassCard
          mode="add"
          attributeCount={attributeCount}
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
                <Pill size={Size.Sm} style={{ marginLeft: 8 }}>
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
          size={Size.Sm}
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

  // Debug: log the data structure
  console.log("GUIContent config:", config);
  console.log("GUIContent classes:", classes);
  console.log("GUIContent attributes:", attributes);

  const handleAddClass = useCallback(
    (name: string) => {
      if (!config) return;
      const newClasses = [...classes, name];
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
