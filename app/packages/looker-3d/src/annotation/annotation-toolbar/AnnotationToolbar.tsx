import useCanAnnotate from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useCanAnnotate";
import { ActionToolbar } from "@fiftyone/components";
import { getEventBus } from "@fiftyone/events";
import * as fos from "@fiftyone/state";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRecoilValue } from "recoil";
import {
  ANNOTATION_TOOLBAR_EVENT,
  type Looker3dE2EEvents,
} from "../../constants";
import type { AnnotationToolbarProps } from "../types";
import { useAnnotationActions } from "./useAnnotationActions";
import { Orientation, ZIndex } from "@voxel51/voodo";

export const AnnotationToolbar = ({ className }: AnnotationToolbarProps) => {
  const { actions, transformMode } = useAnnotationActions();
  const canAnnotate = useCanAnnotate();
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
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

  const visible = canAnnotate && !!portalContainer;
  const shownTransformMode = actions.some(
    (group) => group.id === "transform-actions" && !group.isHidden,
  )
    ? transformMode
    : "";

  useEffect(() => {
    getEventBus<Looker3dE2EEvents>().dispatch(ANNOTATION_TOOLBAR_EVENT, {
      visible,
      transformMode: visible ? shownTransformMode : "",
    });
  }, [visible, shownTransformMode]);

  if (!visible) {
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
    portalContainer,
  );
};
