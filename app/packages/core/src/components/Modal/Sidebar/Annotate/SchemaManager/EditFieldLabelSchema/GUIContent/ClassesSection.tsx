/**
 * Classes section component for managing class names.
 */

import {
  Button,
  Checkbox,
  Input,
  Orientation,
  RichList,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React, { useCallback, useMemo, useState } from "react";
import { EditSectionHeader, EmptyStateBox, Section } from "../../styled";
import {
  createRichListItem,
  formatAttributeCount,
  getClassNameError,
  type RichListItem,
} from "../../utils";
import AddClassCard from "./AddClassCard";
import CardActions from "./CardActions";
import EditAction from "./EditAction";

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

interface ClassesSectionProps {
  classes: string[];
  attributeCount: number;
  onAddClass: (name: string) => void;
  onEditClass: (oldName: string, newName: string) => void;
  onDeleteClass: (name: string) => void;
  onOrderChange?: (newOrder: string[]) => void;
}

const ClassesSection = ({
  classes,
  attributeCount,
  onAddClass,
  onEditClass,
  onDeleteClass,
  onOrderChange,
}: ClassesSectionProps) => {
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

  const listItems: RichListItem[] = useMemo(
    () =>
      classes.map((name) =>
        name === editingClass
          ? createRichListItem({
              id: name,
              canDrag: true,
              primaryContent: "Edit class",
              actions: (
                <CardActions
                  onDelete={handleDeleteClass}
                  onSave={handleEditSave}
                  canSave={!editError}
                />
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
            })
          : createRichListItem({
              id: name,
              canDrag: true,
              primaryContent: name,
              secondaryContent: formatAttributeCount(attributeCount),
              actions: <EditAction onEdit={() => handleStartEdit(name)} />,
            })
      ),
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
    (newItems: RichListItem[]) => {
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

export default ClassesSection;
