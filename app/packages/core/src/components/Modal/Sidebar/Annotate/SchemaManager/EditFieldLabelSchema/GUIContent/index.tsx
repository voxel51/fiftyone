/**
 * Main GUI View component for editing field schema.
 */

import { LoadingSpinner, scrollable } from "@fiftyone/components";
import {
  Button,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useCallback, useMemo } from "react";
import { PRIMITIVE_FIELD_TYPES } from "../../constants";
import { useFieldType } from "../../hooks";
import {
  EditSectionHeader,
  EmptyStateBox,
  ListContainer,
  Section,
} from "../../styled";
import type { AttributeConfig, SchemaConfigType } from "../../utils";
import AttributesSection from "./AttributesSection";
import ClassesSection from "./ClassesSection";
import PrimitiveFieldContent from "./PrimitiveFieldContent";

// Re-export types for external use
export type {
  AttributeConfig,
  ClassConfig,
  SchemaConfigType,
} from "../../utils";

interface GUIContentProps {
  field: string;
  config: SchemaConfigType | undefined;
  scanning: boolean;
  onCancelScan?: () => void;
  onConfigChange?: (config: SchemaConfigType) => void;
}

const GUIContent = ({
  field,
  config,
  scanning,
  onCancelScan,
  onConfigChange,
}: GUIContentProps) => {
  const fType = useFieldType(field);
  const isPrimitive = fType ? PRIMITIVE_FIELD_TYPES.has(fType) : false;

  const classes = useMemo(() => config?.classes || [], [config?.classes]);
  const attributes = useMemo(
    () => config?.attributes || [],
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
    (attrConfig: AttributeConfig) => {
      if (!config) return;
      // Add new attribute at the beginning of the list
      const newAttributes = [attrConfig, ...attributes];
      onConfigChange?.({ ...config, attributes: newAttributes });
    },
    [config, attributes, onConfigChange]
  );

  const handleEditAttribute = useCallback(
    (oldName: string, attrConfig: AttributeConfig) => {
      if (!config) return;
      const newAttributes = attributes.map((attr) =>
        attr.name === oldName ? attrConfig : attr
      );
      onConfigChange?.({ ...config, attributes: newAttributes });
    },
    [config, attributes, onConfigChange]
  );

  const handleDeleteAttribute = useCallback(
    (name: string) => {
      if (!config) return;
      const newAttributes = attributes.filter((attr) => attr.name !== name);
      onConfigChange?.({ ...config, attributes: newAttributes });
    },
    [config, attributes, onConfigChange]
  );

  const handleAttributeOrderChange = useCallback(
    (newOrder: AttributeConfig[]) => {
      if (!config) return;
      onConfigChange?.({ ...config, attributes: newOrder });
    },
    [config, onConfigChange]
  );

  // Primitive field types show a different UI
  if (isPrimitive && fType) {
    return (
      <ListContainer className={scrollable}>
        <Section>
          <PrimitiveFieldContent
            field={field}
            fieldType={fType}
            config={config}
            onConfigChange={onConfigChange}
            largeLabels
          />
        </Section>
      </ListContainer>
    );
  }

  if (scanning) {
    return (
      <ListContainer className={scrollable}>
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
        <Button
          size={Size.Sm}
          variant={Variant.Secondary}
          onClick={onCancelScan}
          style={{ alignSelf: "center", marginTop: 8 }}
        >
          Cancel
        </Button>
      </ListContainer>
    );
  }

  return (
    <ListContainer className={scrollable}>
      <ClassesSection
        classes={classes}
        attributeCount={attributes.length}
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
        onOrderChange={handleAttributeOrderChange}
      />
    </ListContainer>
  );
};

export default GUIContent;
