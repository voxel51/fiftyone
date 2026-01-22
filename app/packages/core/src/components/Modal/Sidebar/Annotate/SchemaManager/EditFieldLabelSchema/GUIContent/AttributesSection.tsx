/**
 * Attributes section component for managing attributes.
 */

import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
import {
  Button,
  Clickable,
  Icon,
  IconName,
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
import type { ListItemProps } from "@voxel51/voodo";
import { useCallback, useMemo, useState } from "react";
import { EditSectionHeader, EmptyStateBox, Section } from "../../styled";
import {
  getAttributeFormError,
  getAttributeNameError,
  getAttributeTypeLabel,
  toAttributeConfig,
  toFormData,
  type AttributeConfig,
  type AttributeFormData,
} from "../../utils";
import AddAttributeCard from "./AddAttributeCard";
import { createAttributeCardItem } from "./AttributeCard";
import EditAction from "./EditAction";

interface AttributesSectionProps {
  attributes: Record<string, AttributeConfig>;
  onAddAttribute: (name: string, config: AttributeConfig) => void;
  onEditAttribute: (
    oldName: string,
    newName: string,
    config: AttributeConfig
  ) => void;
  onDeleteAttribute: (name: string) => void;
}

const AttributesSection = ({
  attributes,
  onAddAttribute,
  onEditAttribute,
  onDeleteAttribute,
}: AttributesSectionProps) => {
  const { isEnabled: isM4Enabled } = useFeature({
    feature: FeatureFlag.VFF_ANNOTATION_M4,
  });

  const [isAdding, setIsAdding] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<string | null>(null);
  const [editingFormState, setEditingFormState] =
    useState<AttributeFormData | null>(null);

  const existingAttributeNames = useMemo(
    () => Object.keys(attributes),
    [attributes]
  );

  const editNameError =
    editingAttribute && editingFormState
      ? getAttributeNameError(
          editingFormState.name,
          existingAttributeNames,
          editingAttribute
        )
      : null;

  const editFormError = editingFormState
    ? getAttributeFormError(editingFormState)
    : null;

  const editError = editNameError || editFormError;

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
        setEditingFormState(toFormData(name, config));
      }
    },
    [attributes]
  );

  const handleEditSave = useCallback(() => {
    if (!editingAttribute || !editingFormState || editError) return;
    onEditAttribute(
      editingAttribute,
      editingFormState.name.trim(),
      toAttributeConfig(editingFormState)
    );
    setEditingAttribute(null);
    setEditingFormState(null);
  }, [editingAttribute, editingFormState, editError, onEditAttribute]);

  const handleCancelEdit = useCallback(() => {
    setEditingAttribute(null);
    setEditingFormState(null);
  }, []);

  const handleDeleteAttribute = useCallback(() => {
    if (editingAttribute) {
      onDeleteAttribute(editingAttribute);
      setEditingAttribute(null);
      setEditingFormState(null);
    }
  }, [editingAttribute, onDeleteAttribute]);

  const listItems = useMemo(() => {
    return Object.entries(attributes).map(([name, config]) => {
      // Editing mode: use shared card item creator
      if (name === editingAttribute && editingFormState) {
        return createAttributeCardItem({
          id: name,
          title: "Edit attribute",
          formState: editingFormState,
          onFormStateChange: setEditingFormState,
          nameError: editNameError,
          canSave: !editError,
          onSave: handleEditSave,
          onCancel: handleCancelEdit,
          onDelete: handleDeleteAttribute,
        });
      }

      // Display mode: show attribute summary
      const typeLabel = getAttributeTypeLabel(config.type);
      const optionCount = config.values?.length;
      const secondaryParts = [typeLabel];
      if (optionCount !== undefined && optionCount > 0) {
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
              {isM4Enabled && config.read_only && (
                <Pill size={Size.Md} style={{ marginLeft: 8 }}>
                  Read-only
                </Pill>
              )}
            </>
          ),
          actions: (
            <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
              <Clickable
                onClick={() => onDeleteAttribute(name)}
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
    editNameError,
    editError,
    isM4Enabled,
    handleCancelEdit,
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

export default AttributesSection;
