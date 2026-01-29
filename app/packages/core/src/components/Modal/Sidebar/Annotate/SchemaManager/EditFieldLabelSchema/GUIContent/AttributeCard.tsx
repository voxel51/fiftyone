/**
 * Shared card component for add/edit attribute forms.
 * Used by both AddAttributeCard and AttributesSection edit mode.
 */

import { Orientation, RichList, Spacing, Stack } from "@voxel51/voodo";
import type { AttributeFormData, ListItemProps } from "../../utils";
import AttributeFormContent from "./AttributeFormContent";
import CardActions from "./CardActions";

interface AttributeCardProps {
  id: string;
  title: string;
  formState: AttributeFormData;
  onFormStateChange: (state: AttributeFormData) => void;
  nameError: string | null;
  canSave: boolean;
  onSave: () => void;
  onCancel: () => void;
  /** Optional delete button click handler (trash icon) - only shown if provided */
  onDelete?: () => void;
  /** Whether the card can be dragged (default: false) */
  canDrag?: boolean;
  /** When true, name and type are rendered as read-only text */
  isEditing?: boolean;
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
  onDelete,
  canDrag = false,
  isEditing = false,
}: AttributeCardProps): {
  id: string;
  data: ListItemProps;
} => ({
  id,
  data: {
    canSelect: false,
    canDrag,
    primaryContent: title,
    actions: (
      <CardActions
        onCancel={onCancel}
        onSave={onSave}
        canSave={canSave}
        onDelete={onDelete}
      />
    ),
    additionalContent: (
      <AttributeFormContent
        formState={formState}
        onFormStateChange={onFormStateChange}
        nameError={nameError}
        isEditing={isEditing}
      />
    ),
  },
});

/**
 * Standalone attribute card component with RichList wrapper.
 * Use this for the "Add attribute" card that renders independently.
 */
const AttributeCard = (props: AttributeCardProps) => {
  const listItem = createAttributeCardItem(props);

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
      <RichList listItems={[listItem]} draggable={false} />
    </Stack>
  );
};

export default AttributeCard;
