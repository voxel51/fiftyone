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
  attributeConfigToFormState,
  formStateToAttributeConfig,
  getAttributeNameError,
  getAttributeTypeLabel,
  type AttributeConfig,
  type AttributeFormState,
} from "../../utils";
import AddAttributeCard from "./AddAttributeCard";
import AttributeFormContent from "./SetAttribute";
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
    editError,
    isM4Enabled,
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
