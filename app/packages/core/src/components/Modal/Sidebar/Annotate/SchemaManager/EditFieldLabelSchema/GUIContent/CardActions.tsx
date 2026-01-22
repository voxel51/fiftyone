/**
 * Shared action buttons for add/edit cards.
 */

import Close from "@mui/icons-material/Close";
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
  onCancel?: () => void;
  onDelete?: () => void;
  onSave: () => void;
  canSave: boolean;
}

const CardActions = ({
  onCancel,
  onDelete,
  onSave,
  canSave,
}: CardActionsProps) => (
  <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
    {onCancel && (
      <Clickable onClick={onCancel} style={{ padding: 4 }}>
        <Close sx={{ fontSize: 20 }} />
      </Clickable>
    )}
    {onDelete && (
      <Clickable onClick={onDelete} style={{ padding: 4 }}>
        <Icon name={IconName.Delete} size={Size.Md} />
      </Clickable>
    )}
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
);

export default CardActions;
