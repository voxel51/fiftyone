/**
 * Attributes section component for managing attributes.
 */

import {
  Button,
  Pill,
  RichList,
  Size,
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
  type RichListItem,
} from "../../utils";
import EditAction from "./EditAction";

interface AttributesSectionProps {
  attributes: Record<string, AttributeConfig>;
  onAddAttribute: () => void;
  onEditAttribute: (name: string) => void;
}

const AttributesSection = ({
  attributes,
  onAddAttribute,
  onEditAttribute,
}: AttributesSectionProps) => {
  const listItems: RichListItem[] = useMemo(() => {
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

      return createRichListItem({
        id: name,
        primaryContent: name,
        secondaryContent: (
          <>
            {secondaryParts.join(" · ")}
            {config.read_only && (
              <Pill size={Size.Md} style={{ marginLeft: 8 }}>
                Read-only
              </Pill>
            )}
          </>
        ),
        actions: <EditAction onEdit={() => onEditAttribute(name)} />,
      });
    });
  }, [attributes, onEditAttribute]);

  return (
    <Section>
      <EditSectionHeader>
        <Text variant={TextVariant.Lg}>Attributes</Text>
        <Button
          size={Size.Md}
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

export default AttributesSection;
