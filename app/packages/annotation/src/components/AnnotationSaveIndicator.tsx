import { Size } from "@voxel51/voodo";
import React from "react";
import { useSaveStatus } from "../persistence";
import { SaveStatusIndicator } from "./SaveStatusIndicator";

export interface AnnotationSaveIndicatorProps {
  /** Icon size, forwarded to the base indicator. */
  size?: Size;
}

/**
 * Annotation-bound save-status light. Binds the shared autosave status (health
 * + in-flight) published by the persistence composition root and renders the
 * presentational {@link SaveStatusIndicator}. Mount this wherever the save
 * status should surface in the annotation UI.
 */
export const AnnotationSaveIndicator: React.FC<
  AnnotationSaveIndicatorProps
> = ({ size }) => {
  const { health, inFlight, lastSavedAt } = useSaveStatus();

  return (
    <SaveStatusIndicator
      health={health}
      pulsing={inFlight}
      lastSavedAt={lastSavedAt}
      size={size}
    />
  );
};
