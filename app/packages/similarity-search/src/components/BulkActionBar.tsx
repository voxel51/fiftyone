import Delete from "@mui/icons-material/Delete";
import {
  Button,
  Size,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Orientation,
  Spacing,
  Variant,
} from "@voxel51/voodo";
import React, { useCallback, useState } from "react";

type BulkActionBarProps = {
  selectedCount: number;
  onDelete: () => void;
  onCancel: () => void;
};

const DeleteIcon = () => <Delete fontSize="small" />;

export default function BulkActionBar({
  selectedCount,
  onDelete,
  onCancel,
}: BulkActionBarProps) {
  const [confirming, setConfirming] = useState(false);

  const handleDeleteClick = useCallback(() => {
    setConfirming(true);
  }, []);

  const handleConfirm = useCallback(() => {
    setConfirming(false);
    onDelete();
  }, [onDelete]);

  const handleCancelConfirm = useCallback(() => {
    setConfirming(false);
  }, []);

  if (selectedCount === 0) return null;

  const label = `${selectedCount} ${selectedCount === 1 ? "run" : "runs"}`;

  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "0.75rem 1rem",
        background: "var(--fo-palette-background-level2)",
        borderTop: "1px solid var(--fo-palette-divider)",
        zIndex: 10,
      }}
    >
      {confirming ? (
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Sm}
          style={{
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text variant={TextVariant.Md} color={TextColor.Destructive}>
            Delete {label}?
          </Text>
          <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
            <Button
              size={Size.Sm}
              variant={Variant.Secondary}
              onClick={handleCancelConfirm}
            >
              Cancel
            </Button>
            <Button
              size={Size.Sm}
              variant={Variant.Danger}
              leadingIcon={DeleteIcon}
              onClick={handleConfirm}
            >
              Confirm Delete
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Sm}
          style={{
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text variant={TextVariant.Md} color={TextColor.Primary}>
            {label} selected
          </Text>
          <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
            <Button
              size={Size.Sm}
              variant={Variant.Secondary}
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              size={Size.Sm}
              variant={Variant.Danger}
              leadingIcon={DeleteIcon}
              onClick={handleDeleteClick}
            >
              Delete
            </Button>
          </Stack>
        </Stack>
      )}
    </div>
  );
}
