import {
  useAutoSave,
  useRegisterAnnotationCommandHandlers,
  useRegisterAnnotationEventHandlers,
  useRegisterAnnotationKeybindings,
  useRegisterRendererEventHandlers,
} from "@fiftyone/annotation";
import * as fos from "@fiftyone/state";
import { ModalMode, useModalMode } from "@fiftyone/state";
import { Fragment } from "react";
import { useRecoilValueLoadable } from "recoil";
import { useAnnotationStatus } from "./Sidebar/Annotate/Edit/useAnnotationStatus";
import { useAnnotationTracking } from "./Sidebar/Annotate/useAnnotationTracking";

const AnnotationHandlerRegistrationInner = () => {
  useRegisterAnnotationCommandHandlers();
  useRegisterAnnotationEventHandlers();
  useRegisterAnnotationKeybindings();
  useRegisterRendererEventHandlers();
  useAnnotationTracking();
  useAnnotationStatus();

  const modalMode = useModalMode();

  useAutoSave(modalMode === ModalMode.ANNOTATE);

  return <Fragment />;
};

/**
 * Registers the modal's annotation command/event/keybinding/renderer handlers
 * and status bar.
 *
 * Imported lazily and gated on annotation permission so the heavy in-modal
 * annotation + looker code never reaches the page-load bundle for users who
 * can't annotate.
 */
const AnnotationModalSupport = () => {
  // Sparse groups can have no sample on the active slice; the annotation
  // hooks below read modalSample and would throw GroupSampleNotFound. Skip
  // registration entirely until the slice has a sample.
  const modal = useRecoilValueLoadable(fos.modalSample);
  if (
    modal.state === "hasError" &&
    modal.contents instanceof fos.GroupSampleNotFound
  ) {
    return <Fragment />;
  }
  return <AnnotationHandlerRegistrationInner />;
};

export default AnnotationModalSupport;
