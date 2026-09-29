import {
  Button,
  Checkbox,
  DeleteOutlineIcon,
  ErrorOutlineIcon,
  Modal,
  ModalSize,
  RemoveCircleOutlineIcon,
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

/** Shared confirmation for deleting a subset or removing selected members. */
export default function SubsetConfirmationDialog({
  action,
  subsetName,
  scopeLabel,
  close,
  confirm,
  busy,
  error,
}: {
  action: "delete" | "remove";
  subsetName: string;
  scopeLabel: string | null;
  close: () => void;
  confirm: (remember: boolean) => void;
  busy: boolean;
  error: string | null;
}) {
  const [remember, setRemember] = useState(false);
  const deleting = action === "delete";
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) close();
      }}
      title={
        <>
          {deleting ? "Delete " : "Remove from "}
          <i>{subsetName}</i>
        </>
      }
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
            leadingIcon={deleting ? DeleteOutlineIcon : RemoveCircleOutlineIcon}
            disabled={busy}
            onClick={() => confirm(remember)}
          >
            {busy
              ? deleting
                ? "Deleting…"
                : "Removing…"
              : deleting
                ? "Delete subset"
                : "Remove selected"}
          </Button>
        </div>
      }
    >
      <div className={styles.dialogBody} style={trayTheme}>
        <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
          {deleting
            ? `This removes the saved selection${scopeLabel ? ` of ${scopeLabel}` : ""}. Samples, media, annotations, and tags stay.`
            : `Remove ${scopeLabel} from this subset and your selection. Samples, media, annotations, and tags stay.`}
        </Text>
        <Checkbox
          label="Don't ask for confirmation again"
          className={styles.confirmationCheckbox}
          checked={remember}
          onChange={setRemember}
          disabled={busy}
        />
        {error && (
          <Notice
            tone="error"
            icon={ErrorOutlineIcon}
            role="alert"
            title={error}
          >
            {deleting
              ? "Could not confirm deletion; try again."
              : "Your captured selection is kept for retry."}
          </Notice>
        )}
      </div>
    </Modal>
  );
}
