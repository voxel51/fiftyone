import type React from "react";
import { useCallback, useRef } from "react";

/**
 * Handlers for a modal backdrop that dismisses on a click outside the
 * dialog.
 *
 * A press that starts inside the dialog and is released over the backdrop,
 * such as selecting an input's text by dragging past the dialog's edge,
 * still fires a `click` on the backdrop. Only a press that both starts and
 * ends on the backdrop dismisses.
 */
export const useBackdropDismiss = (onDismiss: () => void) => {
  const pressedOnBackdrop = useRef(false);

  const onMouseDown = useCallback((event: React.MouseEvent) => {
    pressedOnBackdrop.current = event.target === event.currentTarget;
  }, []);

  const onClick = useCallback(
    (event: React.MouseEvent) => {
      const dismiss =
        pressedOnBackdrop.current && event.target === event.currentTarget;
      pressedOnBackdrop.current = false;
      if (dismiss) onDismiss();
    },
    [onDismiss],
  );

  return { onMouseDown, onClick };
};
