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
import { useMemo } from "react";
import { EditSectionHeader, EmptyStateBox, Section } from "../../styled";
import {
  createRichListItem,
  getAttributeTypeLabel,
  type AttributeConfig,
} from "../../utils";
import AttributeCard from "./AttributeCard";
import EditAction from "./EditAction";
import useAttributesSection from "./useAttributesSection";

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

  const {
    isAdding,
    addFormState,
    addNameError,
    canAdd,
    startAdd,
    cancelAdd,
    handleAddFormChange,
    saveAdd,
    editingAttribute,
    editFormState,
    editNameError,
    canEdit,
    startEdit,
    deleteEditing,
    handleEditFormChange,
    saveEdit,
    isEditingOrAdding,
  } = useAttributesSection({
    attributes,
    onAddAttribute,
    onEditAttribute,
    onDeleteAttribute,
  });

  const listItems = useMemo(() => {
    return Object.entries(attributes)
      .filter(([name]) => name !== editingAttribute)
      .map(([name, config]) => {
        const typeLabel = getAttributeTypeLabel(config.type);
        const optionCount = config.values?.length;
        const secondaryParts = [typeLabel];
        if (optionCount !== undefined) {
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
              <EditAction onEdit={() => startEdit(name)} />
            </Stack>
          ),
        });
      });
  }, [attributes, editingAttribute, isM4Enabled, onDeleteAttribute, startEdit]);

  return (
    <Section>
      <EditSectionHeader>
        <Text variant={TextVariant.Lg}>Attributes</Text>
        <Button
          size={Size.Md}
          variant={Variant.Secondary}
          onClick={startAdd}
          disabled={isEditingOrAdding}
        >
          + Add attribute
        </Button>
      </EditSectionHeader>

      {/* Add new attribute card */}
      {isAdding && (
        <AttributeCard
          mode="add"
          formState={addFormState}
          onFormStateChange={handleAddFormChange}
          nameError={addNameError}
          canSave={canAdd}
          onSave={saveAdd}
          onCancel={cancelAdd}
        />
      )}

      {/* Edit attribute card */}
      {editingAttribute && editFormState && (
        <AttributeCard
          mode="edit"
          formState={editFormState}
          onFormStateChange={handleEditFormChange}
          nameError={editNameError}
          canSave={canEdit}
          onSave={saveEdit}
          onCancel={deleteEditing}
        />
      )}

      {listItems.length === 0 && !isAdding && !editingAttribute ? (
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
