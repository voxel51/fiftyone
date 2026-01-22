/**
 * Shared card component for add/edit attribute forms.
 * Used by both AddAttributeCard and AttributesSection edit mode.
 */

import {
  Clickable,
  Icon,
  IconName,
  Orientation,
  RichList,
  Size,
  Spacing,
  Stack,
} from "@voxel51/voodo";
import type { ListItemProps } from "@voxel51/voodo";
import type { AttributeFormData } from "../../utils";
import AttributeFormContent from "./AttributeFormContent";

interface AttributeCardProps {
  /** Unique ID for the list item */
  id: string;
  /** Card title (e.g., "New attribute" or "Edit attribute") */
  title: string;
  /** Current form state */
  formState: AttributeFormData;
  /** Form state change handler */
  onFormStateChange: (state: AttributeFormData) => void;
  /** Name validation error to display */
  nameError: string | null;
  /** Whether the save button should be enabled */
  canSave: boolean;
  /** Save button click handler */
  onSave: () => void;
  /** Cancel/delete button click handler */
  onCancel: () => void;
  /** Optional: render the card without RichList wrapper (for embedding in existing lists) */
  embedded?: boolean;
}

/**
 * Creates the list item configuration for an attribute form card.
 */
export const createAttributeCardItem = ({
  id,
  title,
  formState,
  onFormStateChange,
  nameError,
  canSave,
  onSave,
  onCancel,
}: Omit<AttributeCardProps, "embedded">): {
  id: string;
  data: ListItemProps;
} => ({
  id,
  data: {
    canSelect: false,
    canDrag: false,
    primaryContent: title,
    actions: (
      <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
        <Clickable onClick={onCancel} style={{ padding: 4 }}>
          <Icon name={IconName.Delete} size={Size.Md} />
        </Clickable>
        <Clickable
          onClick={onSave}
          style={{
            padding: 4,
            opacity: canSave ? 1 : 0.5,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          <Icon name={IconName.Check} size={Size.Md} />
        </Clickable>
      </Stack>
    ),
    additionalContent: (
      <AttributeFormContent
        formState={formState}
        onFormStateChange={onFormStateChange}
        nameError={nameError}
      />
    ),
  } as ListItemProps,
});

/**
 * Standalone attribute card component with RichList wrapper.
 * Use this for the "Add attribute" card that renders independently.
 */
const AttributeCard = (props: AttributeCardProps) => {
  const { embedded, ...itemProps } = props;

  if (embedded) {
    // When embedded, the parent component manages the RichList
    return null;
  }

  const listItem = createAttributeCardItem(itemProps);

  return (
    <div style={{ marginBottom: "1rem" }}>
      <RichList listItems={[listItem]} draggable={false} />
    </div>
  );
};

export default AttributeCard;
