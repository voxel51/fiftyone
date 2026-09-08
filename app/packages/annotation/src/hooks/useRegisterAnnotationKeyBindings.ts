import { KnownContexts, useKeyBindings } from "@fiftyone/commands";
import { useLighter } from "@fiftyone/lighter";

export const useRegisterAnnotationKeybindings = () => {
  const { scene } = useLighter();

  useKeyBindings(
    KnownContexts.ModalAnnotate,
    [
      {
        commandId: "lighter-reset-zoom-pan",
        sequence: "r",
        handler: () => scene.resetZoomPan(),
        label: "Reset zoom and pan",
      },
    ],
    [scene],
  );
};
