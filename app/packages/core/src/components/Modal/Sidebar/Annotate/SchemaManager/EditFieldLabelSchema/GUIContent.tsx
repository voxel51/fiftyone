/**
 * GUI editing components for classes and attributes.
 */

import { LoadingSpinner } from "@fiftyone/components";
import { EditOutlined } from "@mui/icons-material";
import {
  Button,
  Clickable,
  Pill,
  RichList,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import type { ListItemProps } from "@voxel51/voodo";
import React, { useCallback, useMemo } from "react";
import {
  EditSectionHeader,
  EmptyStateBox,
  ListContainer,
  Section,
} from "../styled";

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

// Classes section component
export const ClassesSection = ({
  classes,
  attributeCount,
  onAddClass,
  onEditClass,
  onOrderChange,
}: {
  classes: string[];
  attributeCount: number;
  onAddClass: () => void;
  onEditClass: (name: string) => void;
  onOrderChange?: (newOrder: string[]) => void;
}) => {
  const listItems = useMemo(
    () =>
      classes.map((name) => ({
        id: name,
        data: {
          canSelect: false,
          canDrag: true,
          primaryContent: name,
          secondaryContent: `${attributeCount} attribute${
            attributeCount !== 1 ? "s" : ""
          }`,
          actions: <EditAction onEdit={() => onEditClass(name)} />,
        } as ListItemProps,
      })),
    [classes, attributeCount, onEditClass]
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
        <Button size={Size.Sm} variant={Variant.Secondary} onClick={onAddClass}>
          + Add class
        </Button>
      </EditSectionHeader>
      {classes.length === 0 ? (
        <EmptyStateBox>
          <Text color={TextColor.Secondary}>No classes defined</Text>
        </EmptyStateBox>
      ) : (
        <RichList
          listItems={listItems}
          draggable={true}
          onOrderChange={handleOrderChange}
        />
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
  onClassOrderChange?: (newOrder: string[]) => void;
}

const GUIContent = ({
  config,
  scanning,
  onClassOrderChange,
}: GUIContentProps) => {
  const classes = config?.classes || [];
  const attributes = config?.attributes || {};

  // Debug: log the data structure
  console.log("GUIContent config:", config);
  console.log("GUIContent classes:", classes);
  console.log("GUIContent attributes:", attributes);

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
        onAddClass={() => {
          // TODO: Implement add class
        }}
        onEditClass={(_name) => {
          // TODO: Implement edit class
        }}
        onOrderChange={onClassOrderChange}
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
