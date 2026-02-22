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
import React, { useCallback, useEffect, useState } from "react";
import { pluralizeRuns } from "../utils";
import * as s from "./styles";

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

  // Reset confirmation state when selection is cleared
  useEffect(() => {
    if (selectedCount === 0) {
      setConfirming(false);
    }
  }, [selectedCount]);

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

  const label = pluralizeRuns(selectedCount);

  return (
    <div style={s.bulkActionBar}>
      {confirming ? (
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Sm}
          style={{ justifyContent: "space-between", alignItems: "center" }}
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
          style={{ justifyContent: "space-between", alignItems: "center" }}
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
