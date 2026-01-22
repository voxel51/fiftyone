/**
 * Shared action buttons for add/edit cards.
 * Used by AttributeCard, AddClassCard, and ClassesSection.
 */

import {
  Clickable,
  Icon,
  IconName,
  Orientation,
  Size,
  Spacing,
  Stack,
} from "@voxel51/voodo";

interface CardActionsProps {
  /** Cancel button click handler (X icon) */
  onCancel: () => void;
  /** Save button click handler (check icon) */
  onSave: () => void;
  /** Whether save is enabled */
  canSave: boolean;
  /** Optional delete button click handler (trash icon) - only shown if provided */
  onDelete?: () => void;
}

const CardActions = ({
  onCancel,
  onSave,
  canSave,
  onDelete,
}: CardActionsProps) => (
  <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
    <Clickable onClick={onCancel} style={{ padding: 4 }}>
      <Icon name={IconName.Close} size={Size.Md} />
    </Clickable>
    {onDelete && (
      <Clickable onClick={onDelete} style={{ padding: 4 }}>
        <Icon name={IconName.Delete} size={Size.Md} />
      </Clickable>
    )}
    <Clickable
      onClick={canSave ? onSave : undefined}
      style={{
        padding: 4,
        opacity: canSave ? 1 : 0.5,
        cursor: canSave ? "pointer" : "not-allowed",
        pointerEvents: canSave ? "auto" : "none",
      }}
    >
      <Icon name={IconName.Check} size={Size.Md} />
    </Clickable>
  </Stack>
);

export default CardActions;
