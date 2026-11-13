import { Modal, ModalSize, Popover, PopoverAnchor } from "@voxel51/voodo";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./SelectionTray.module.css";
import { trayTheme } from "./theme";

/**
 * Where an action works in place: a panel above its toolbar button, or a
 * small modal when the action sits in the overflow menu. A panel that does
 * not dismiss on an outside press still closes when another tray action is
 * pressed, so two never stand open together.
 */
export default function ActionSurface({
  open,
  onClose,
  trigger,
  title,
  surface = "toolbar",
  children,
  className,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  title: string;
  surface?: "toolbar" | "menu";
  children: ReactNode;
  className?: string;
  /** Allow automatic dismissal; otherwise the content owns its close controls. */
  dismissible?: boolean;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  // This effect closes a sticky panel when another tray action's button is
  // pressed; other presses outside it leave it open.
  useEffect(() => {
    if (!open || dismissible || surface === "menu") return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const action = (event.target as Element | null)?.closest(
        "[data-tray-action]",
      );
      if (action && !anchor.current?.contains(action)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, dismissible, surface, onClose]);
  if (surface === "menu")
    return (
      <>
        {trigger}
        <Modal
          open={open}
          onClose={() => {
            if (dismissible) onClose();
          }}
          showCloseButton={dismissible}
          title={title}
          size={ModalSize.Sm}
        >
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
        if (!next && dismissible) onClose();
      }}
      closeOnEscape={dismissible}
      anchor={PopoverAnchor.TopEnd}
      trigger={
        <span ref={anchor} className={styles.surfaceTrigger}>
          {trigger}
        </span>
      }
    >
      <div className={`${styles.sheet} ${className ?? ""}`} style={trayTheme}>
        {children}
      </div>
    </Popover>
  );
}
