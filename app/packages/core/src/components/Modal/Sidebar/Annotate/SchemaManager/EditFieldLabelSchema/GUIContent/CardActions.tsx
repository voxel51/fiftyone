/**
 * Shared action buttons for add/edit cards.
 * Used by AttributeCard, AddClassCard, and ClassesSection.
 */

import {
  Button,
  CheckIcon,
  CloseIcon,
  DeleteIcon,
  Orientation,
  Size,
  Spacing,
  Stack,
  TextColor,
  textColorClass,
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
  readOnly?: boolean;
}

const CardActions = ({
  onCancel,
  onSave,
  canSave,
  onDelete,
  readOnly = false,
}: CardActionsProps) => (
  <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
    <Button variant={Variant.Icon} borderless onClick={onCancel}>
      <CloseIcon
        size={Size.Md}
        className={textColorClass(TextColor.Secondary)}
      />
    </Button>
    {!readOnly && (
      <>
        {onDelete && (
          <Button variant={Variant.Icon} borderless onClick={onDelete}>
            <DeleteIcon
              size={Size.Md}
              className={textColorClass(TextColor.Secondary)}
            />
          </Button>
        )}
        <Button
          variant={Variant.Icon}
          borderless
          onClick={canSave ? onSave : undefined}
          disabled={!canSave}
        >
          <CheckIcon
            size={Size.Md}
            className={textColorClass(TextColor.Secondary)}
          />
        </Button>
      </>
    )}
  </Stack>
);

export default CardActions;
