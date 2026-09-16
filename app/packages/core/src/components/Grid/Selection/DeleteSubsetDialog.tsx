import {
  deleteSubset,
  selectionScopeLabel,
  useInvalidateSelectionScope,
  type SavedSubset,
  type SelectionUnit,
} from "@fiftyone/state/src/selection";
import {
  Button,
  DeleteOutlineIcon,
  ErrorOutlineIcon,
  Modal,
  ModalSize,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useState } from "react";
import { Notice } from "./Notice";
import styles from "./SelectionTray.module.css";
import { trayTheme } from "./theme";

/**
 * Confirms deleting a saved subset. Only the saved selection goes; the
 * samples, their media, annotations, and tags are untouched.
 */
export default function DeleteSubsetDialog({
  datasetId,
  subset,
  unit,
  close,
  onDeleted,
}: {
  datasetId: string;
  subset: SavedSubset;
  unit: SelectionUnit;
  close: () => void;
  onDeleted: () => void;
}) {
  const invalidate = useInvalidateSelectionScope(datasetId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteSubset(datasetId, subset.id);
      invalidate();
      onDeleted();
      close();
    } catch (cause) {
      setError(String(cause));
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) close();
      }}
      title="Delete subset"
      size={ModalSize.Sm}
      footer={
        <div className={styles.footerActions}>
          <Button
            size={Size.Sm}
            variant={Variant.Borderless}
            onClick={close}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            size={Size.Sm}
            variant={Variant.Danger}
            leadingIcon={DeleteOutlineIcon}
            disabled={busy}
            onClick={() => void remove()}
          >
            {busy ? "Deleting…" : "Delete subset"}
          </Button>
        </div>
      }
    >
      <div className={styles.dialogBody} style={trayTheme}>
        <Text variant={TextVariant.Md}>{`Delete ${subset.name}?`}</Text>
        <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
          {`This removes the saved selection of ${selectionScopeLabel(subset.counts, unit)}. Samples, media, annotations, and tags stay.`}
        </Text>
        {error && (
          <Notice
            tone="error"
            icon={ErrorOutlineIcon}
            role="alert"
            title={error}
          >
            Nothing was deleted; try again.
          </Notice>
        )}
      </div>
    </Modal>
  );
}
