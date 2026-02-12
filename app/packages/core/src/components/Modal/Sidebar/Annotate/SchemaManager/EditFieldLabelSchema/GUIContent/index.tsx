/**
 * Main GUI View component for editing field schema.
 */

import { LoadingSpinner } from "@fiftyone/components";
import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import { useCallback, useMemo } from "react";
import {
  EditSectionHeader,
  EmptyStateBox,
  ListContainer,
  Section,
} from "../../styled";
import type { SchemaConfigType } from "../../utils";
import AttributesSection from "./AttributesSection";
import ClassesSection from "./ClassesSection";

// Re-export types for external use
export type {
  AttributeConfig,
  ClassConfig,
  SchemaConfigType,
} from "../../utils";

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
