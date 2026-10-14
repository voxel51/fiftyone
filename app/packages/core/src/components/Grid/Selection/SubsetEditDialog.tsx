import { useSelectionSubsetDisabledReason } from "@fiftyone/state";
import {
  updateSubset,
  useInvalidateSelectionScope,
  type SavedSubset,
} from "@fiftyone/state/src/selection";
import {
  Button,
  DeleteOutlineIcon,
  ErrorOutlineIcon,
  FormField,
  Input,
  Justify,
  Modal,
  ModalSize,
  Orientation,
  ResizeBehavior,
  Spacing,
  Stack,
  TextArea,
} from "@voxel51/voodo";
import { useId, useState } from "react";
import { Notice } from "./Notice";
import styles from "./SelectionTray.module.css";
import { trayTheme } from "./theme";

/** Edits subset metadata; deletion continues through the shared confirmation. */
export default function SubsetEditDialog({
  datasetId,
  subset,
  close,
  remove,
}: {
  datasetId: string;
  subset: SavedSubset;
  close: () => void;
  remove: () => void;
}) {
  const permission = useSelectionSubsetDisabledReason();
  const invalidate = useInvalidateSelectionScope(datasetId);
  const formId = useId();
  const [name, setName] = useState(subset.name);
  const [description, setDescription] = useState(subset.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed =
    name.trim() !== subset.name ||
    description.trim() !== (subset.description ?? "");
  const save = async () => {
    if (permission || busy || !changed || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await updateSubset(datasetId, subset.id, {
        name: name.trim(),
        description: description.trim() || null,
      });
      invalidate();
      close();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      title="Edit subset"
      size={ModalSize.Sm}
      onClose={() => {
        if (!busy) close();
      }}
      footer={
        <Stack
          orientation={Orientation.Row}
          justify={Justify.End}
          spacing={Spacing.Sm}
          style={{ width: "100%" }}
        >
          <Button
            type="button"
            size="sm"
            variant="danger"
            leadingIcon={DeleteOutlineIcon}
            disabled={busy || Boolean(permission)}
            onClick={remove}
          >
            Delete subset
          </Button>
          <Button
            type="submit"
            form={formId}
            size="sm"
            disabled={busy || Boolean(permission) || !changed || !name.trim()}
          >
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </Stack>
      }
    >
      <form
        id={formId}
        className={styles.dialogBody}
        style={trayTheme}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <FormField
          label="Subset name"
          control={
            <Input
              className={styles.subsetNameInput}
              aria-label="Subset name"
              value={name}
              maxLength={200}
              disabled={busy || Boolean(permission)}
              onChange={(event) => setName(event.target.value)}
            />
          }
        />
        <FormField
          label="Description"
          control={
            <TextArea
              aria-label="Description"
              placeholder="Description (optional)"
              value={description}
              maxLength={1000}
              rows={3}
              resize={ResizeBehavior.None}
              disabled={busy || Boolean(permission)}
              onChange={(event) => setDescription(event.target.value)}
            />
          }
        />
        {error && (
          <Notice
            tone="error"
            icon={ErrorOutlineIcon}
            role="alert"
            title="Could not save subset"
          >
            {error}
          </Notice>
        )}
      </form>
    </Modal>
  );
}
