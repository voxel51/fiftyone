import useCanAnnotate from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useCanAnnotate";
import { ActionToolbar } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRecoilValue } from "recoil";
import type { AnnotationToolbarProps } from "../types";
import { useAnnotationActions } from "./useAnnotationActions";
import { Orientation, ZIndex } from "@voxel51/voodo";

export const AnnotationToolbar = ({ className }: AnnotationToolbarProps) => {
  const { actions } = useAnnotationActions();
  const canAnnotate = useCanAnnotate();
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null
  );
  const isFullscreen = useRecoilValue(fos.fullscreen);

  // Find the modal container to render the toolbar in the same stacking context as navigation arrows
  useEffect(() => {
    if (!canAnnotate) {
      setPortalContainer(null);
      return;
    }

    const modalElement = document.getElementById("modal");
    if (modalElement) {
      setPortalContainer(modalElement);
    } else {
      setPortalContainer(document.body);
    }
  }, [canAnnotate]);

  if (!canAnnotate || !portalContainer) {
    return null;
  }

  return createPortal(
    <ActionToolbar
      className={className}
      groups={actions}
      orientation={Orientation.Column}
      lockX
      xOffset={isFullscreen ? 8 : 50}
      yOffset={isFullscreen ? 55 : 100}
      zIndex={ZIndex.AboveModal}
    />,
    portalContainer
  );
};
