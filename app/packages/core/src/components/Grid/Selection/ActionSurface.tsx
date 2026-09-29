import { Modal, ModalSize, Popover, PopoverAnchor } from "@voxel51/voodo";
import type { ReactNode } from "react";
import styles from "./SelectionTray.module.css";
import { trayTheme } from "./theme";

/**
 * Where an action works in place: a panel above its toolbar button, or a
 * small modal when the action sits in the overflow menu.
 */
export default function ActionSurface({
  open,
  onClose,
  trigger,
  title,
  surface = "toolbar",
  children,
}: {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  title: string;
  surface?: "toolbar" | "menu";
  children: ReactNode;
}) {
  if (surface === "menu")
    return (
      <>
        {trigger}
        <Modal open={open} onClose={onClose} title={title} size={ModalSize.Sm}>
          <div className={styles.modalSheet} style={trayTheme}>
            {children}
          </div>
        </Modal>
      </>
    );
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      anchor={PopoverAnchor.TopEnd}
      trigger={trigger}
    >
      <div className={styles.sheet} style={trayTheme}>
        {children}
      </div>
    </Popover>
  );
}
