/**
 * GUI editing components for classes and attributes.
 * These components are prepared for future use when GUI editing is enabled
 * in the EditFieldLabelSchema view.
 */

import { IconButton, LoadingSpinner } from "@fiftyone/components";
import {
  DeleteOutlined,
  DragIndicator,
  EditOutlined,
} from "@mui/icons-material";
import {
  Button,
  Pill,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React from "react";
import {
  EditSectionHeader,
  EmptyStateBox,
  ItemActions,
  ItemContent,
  ItemRow,
  ListContainer,
  Section,
} from "../styled";

// Types
export interface AttributeConfig {
  type: string;
  options?: string[];
  readOnly?: boolean;
}

export interface ClassConfig {
  attributes?: Record<string, AttributeConfig>;
}

export interface SchemaConfigType {
  classes?: Record<string, ClassConfig>;
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
  };
  return typeMap[type] || type;
};

// Class row component
export const ClassRow = ({
  name,
  attributeCount,
  onDelete,
  onEdit,
}: {
  name: string;
  attributeCount: number;
  onDelete: () => void;
  onEdit: () => void;
}) => (
  <ItemRow>
    <DragIndicator
      fontSize="small"
      sx={{ color: "text.secondary", cursor: "grab" }}
    />
    <ItemContent>
      <Text>{name}</Text>
      <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
        {attributeCount} attribute{attributeCount !== 1 ? "s" : ""}
      </Text>
    </ItemContent>
    <ItemActions>
      <IconButton onClick={onDelete}>
        <DeleteOutlined fontSize="small" />
      </IconButton>
      <IconButton onClick={onEdit}>
        <EditOutlined fontSize="small" />
      </IconButton>
    </ItemActions>
  </ItemRow>
);

// Attribute row component
export const AttributeRow = ({
  name,
  type,
  optionCount,
  readOnly,
  onDelete,
  onEdit,
}: {
  name: string;
  type: string;
  optionCount?: number;
  readOnly?: boolean;
  onDelete: () => void;
  onEdit: () => void;
}) => (
  <ItemRow>
    <DragIndicator
      fontSize="small"
      sx={{ color: "text.secondary", cursor: "grab" }}
    />
    <ItemContent>
      <Text>{name}</Text>
      <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
        {getAttributeTypeLabel(type)}
        {optionCount !== undefined &&
          ` · ${optionCount} option${optionCount !== 1 ? "s" : ""}`}
      </Text>
      {readOnly && <Pill size={Size.Sm}>Read-only</Pill>}
    </ItemContent>
    <ItemActions>
      <IconButton onClick={onDelete}>
        <DeleteOutlined fontSize="small" />
      </IconButton>
      <IconButton onClick={onEdit}>
        <EditOutlined fontSize="small" />
      </IconButton>
    </ItemActions>
  </ItemRow>
);

// Classes section component
export const ClassesSection = ({
  classes,
  onAddClass,
  onDeleteClass,
  onEditClass,
}: {
  classes: Record<string, ClassConfig>;
  onAddClass: () => void;
  onDeleteClass: (name: string) => void;
  onEditClass: (name: string) => void;
}) => {
  const classEntries = Object.entries(classes);

  return (
    <Section>
      <EditSectionHeader>
        <span className="font-medium">Classes</span>
        <Button size={Size.Sm} variant={Variant.Secondary} onClick={onAddClass}>
          + Add class
        </Button>
      </EditSectionHeader>
      {classEntries.length === 0 ? (
        <EmptyStateBox>
          <Text color={TextColor.Secondary}>No classes yet</Text>
        </EmptyStateBox>
      ) : (
        classEntries.map(([name, config]) => (
          <ClassRow
            key={name}
            name={name}
            attributeCount={Object.keys(config.attributes || {}).length}
            onDelete={() => onDeleteClass(name)}
            onEdit={() => onEditClass(name)}
          />
        ))
      )}
    </Section>
  );
};

// Attributes section component
export const AttributesSection = ({
  attributes,
  onAddAttribute,
  onDeleteAttribute,
  onEditAttribute,
}: {
  attributes: Record<string, AttributeConfig>;
  onAddAttribute: () => void;
  onDeleteAttribute: (name: string) => void;
  onEditAttribute: (name: string) => void;
}) => {
  const attrEntries = Object.entries(attributes);

  return (
    <Section>
      <EditSectionHeader>
        <span className="font-medium">Attributes</span>
        <Button
          size={Size.Sm}
          variant={Variant.Secondary}
          onClick={onAddAttribute}
        >
          + Add attribute
        </Button>
      </EditSectionHeader>
      {attrEntries.length === 0 ? (
        <EmptyStateBox>
          <Text color={TextColor.Secondary}>No attributes yet</Text>
        </EmptyStateBox>
      ) : (
        attrEntries.map(([name, config]) => (
          <AttributeRow
            key={name}
            name={name}
            type={config.type}
            optionCount={config.options?.length}
            readOnly={config.readOnly}
            onDelete={() => onDeleteAttribute(name)}
            onEdit={() => onEditAttribute(name)}
          />
        ))
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
  const classes = config?.classes || {};
  const attributes = config?.attributes || {};

  if (scanning) {
    return (
      <ListContainer>
        <Section>
          <EditSectionHeader>
            <span className="font-medium">Classes</span>
          </EditSectionHeader>
          <EmptyStateBox>
            <LoadingSpinner style={{ marginRight: 8 }} />
            <Text color={TextColor.Secondary}>Scanning schema</Text>
          </EmptyStateBox>
        </Section>
        <Section>
          <EditSectionHeader>
            <span className="font-medium">Attributes</span>
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
        onAddClass={() => {
          // TODO: Implement add class
        }}
        onDeleteClass={(name) => {
          // TODO: Implement delete class
        }}
        onEditClass={(name) => {
          // TODO: Implement edit class
        }}
      />
      <AttributesSection
        attributes={attributes}
        onAddAttribute={() => {
          // TODO: Implement add attribute
        }}
        onDeleteAttribute={(name) => {
          // TODO: Implement delete attribute
        }}
        onEditAttribute={(name) => {
          // TODO: Implement edit attribute
        }}
      />
    </ListContainer>
  );
};

export default GUIContent;
