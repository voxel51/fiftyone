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
import { useCallback, useMemo, useState } from "react";
import { NUMERIC_TYPES } from "../../constants";
import { EditSectionHeader, EmptyStateBox, Section } from "../../styled";
import {
  createDefaultFormData,
  createRichListItem,
  getAttributeNameError,
  getAttributeTypeLabel,
  toAttributeConfig,
  toFormData,
  type AttributeConfig,
  type AttributeFormData,
  type RichListItem,
} from "../../utils";
import AttributeFormContent from "./AttributeFormContent";
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

  // Editing state: null = not editing, "new" = adding, string = editing existing
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formState, setFormState] = useState<AttributeFormData | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const existingNames = useMemo(() => Object.keys(attributes), [attributes]);

  const isAdding = editingKey === "new";
  const isEditing = editingKey !== null && editingKey !== "new";

  // Validation
  const nameError = useMemo(() => {
    if (!formState || !isDirty) return null;
    return getAttributeNameError(
      formState.name,
      existingNames,
      isEditing ? editingKey : undefined
    );
  }, [formState, isDirty, existingNames, isEditing, editingKey]);

  const canSave = formState && !nameError && formState.name.trim() !== "";

  // Handlers
  const handleStartAdd = useCallback(() => {
    setEditingKey("new");
    setFormState(createDefaultFormData());
    setIsDirty(false);
  }, []);

  const handleStartEdit = useCallback(
    (name: string) => {
      const config = attributes[name];
      if (config) {
        setEditingKey(name);
        setFormState(toFormData(name, config));
        setIsDirty(false);
      }
    },
    [attributes]
  );

  const handleCancel = useCallback(() => {
    setEditingKey(null);
    setFormState(null);
    setIsDirty(false);
  }, []);

  const handleFormChange = useCallback((newState: AttributeFormData) => {
    setFormState(newState);
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!formState || !canSave) return;

    const isNumeric = NUMERIC_TYPES.includes(formState.type);
    const config = toAttributeConfig(formState, isNumeric);
    const name = formState.name.trim();

    if (isAdding) {
      onAddAttribute(name, config);
    } else if (isEditing && editingKey) {
      onEditAttribute(editingKey, name, config);
    }

    handleCancel();
  }, [
    formState,
    canSave,
    isAdding,
    isEditing,
    editingKey,
    onAddAttribute,
    onEditAttribute,
    handleCancel,
  ]);

  const handleDelete = useCallback(() => {
    if (isEditing && editingKey) {
      onDeleteAttribute(editingKey);
      handleCancel();
    }
  }, [isEditing, editingKey, onDeleteAttribute, handleCancel]);

  // Build list items
  const listItems: RichListItem[] = useMemo(() => {
    return Object.entries(attributes)
      .filter(([name]) => name !== editingKey)
      .map(([name, config]) => {
        const typeLabel = getAttributeTypeLabel(config.type);
        const optionCount = config.values?.length;
        const secondaryParts = [typeLabel];
        if (optionCount !== undefined && optionCount > 0) {
          secondaryParts.push(
            `${optionCount} option${optionCount !== 1 ? "s" : ""}`
          );
        }

        return createRichListItem({
          id: name,
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
        });
      });
  }, [attributes, editingKey, isM4Enabled, onDeleteAttribute, handleStartEdit]);

  // Card actions for add/edit form
  const cardActions = (
    <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
      <Clickable
        onClick={isAdding ? handleCancel : handleDelete}
        style={{ padding: 4 }}
      >
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
  );

  // Form card as RichList item
  const formCard = formState
    ? createRichListItem({
        id: "__form__",
        primaryContent: isAdding ? "New attribute" : "Edit attribute",
        actions: cardActions,
        additionalContent: (
          <AttributeFormContent
            formState={formState}
            onFormStateChange={handleFormChange}
            nameError={nameError}
          />
        ),
      })
    : null;

  return (
    <Section>
      <EditSectionHeader>
        <Text variant={TextVariant.Lg}>Attributes</Text>
        <Button
          size={Size.Md}
          variant={Variant.Secondary}
          onClick={handleStartAdd}
          disabled={editingKey !== null}
        >
          + Add attribute
        </Button>
      </EditSectionHeader>

      {/* Add/Edit form card */}
      {formCard && (
        <div style={{ marginBottom: "1rem" }}>
          <RichList listItems={[formCard]} draggable={false} />
        </div>
      )}

      {/* Attribute list */}
      {listItems.length === 0 && !formCard ? (
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
