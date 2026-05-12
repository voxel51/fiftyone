import { DetectionIcon } from "@fiftyone/components";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { StatusItem, useModalStatusBar } from "../../../ModalStatusBar";
import { _unsafeDetectionModeActiveAtom } from "./useDetectionMode";

/**
 * Registers the modal status bar content for detection-drawing mode.
 * Active iff the user has detection mode enabled.
 */
export const useDetectionStatus = () => {
  const { setContent } = useModalStatusBar();
  const detectionModeActive = useAtomValue(_unsafeDetectionModeActiveAtom);

  useEffect(() => {
    if (!detectionModeActive) return undefined;
    setContent(
      <StatusItem
        icon={<DetectionIcon />}
        label="Click and drag to create a bounding box"
      />
    );
    return () => {
      setContent(null);
    };
  }, [detectionModeActive, setContent]);
};
