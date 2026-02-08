/**
 * Shared action buttons for add/edit cards.
 * Used by AttributeCard, AddClassCard, and ClassesSection.
 */

import {
  Button,
  Icon,
  IconName,
  Orientation,
  Size,
  Spacing,
  Stack,
  Variant,
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
    <Button variant={Variant.Icon} borderless onClick={onCancel}>
      <Icon
        name={IconName.Close}
        size={Size.Md}
        color="var(--color-content-text-secondary)"
      />
    </Button>
    {onDelete && (
      <Button variant={Variant.Icon} borderless onClick={onDelete}>
        <Icon
          name={IconName.Delete}
          size={Size.Md}
          color="var(--color-content-text-secondary)"
        />
      </Button>
    )}
    <Button
      variant={Variant.Icon}
      borderless
      onClick={canSave ? onSave : undefined}
      disabled={!canSave}
    >
      <Icon
        name={IconName.Check}
        size={Size.Md}
        color="var(--color-content-text-secondary)"
      />
    </Button>
  </Stack>
);

export default CardActions;
