import Brush from "@mui/icons-material/Brush";
import Timeline from "@mui/icons-material/Timeline";
import { useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import {
  StatusContent,
  StatusItem,
  useModalStatusBar,
} from "../../../ModalStatusBar";
import { useAIAnnotationStatusContent } from "./useAIAnnotationStatus";
import {
  SegmentationTool,
  _unsafeSegmentationModeActiveAtom,
  _unsafeToolAtom,
} from "./useSegmentationMode";

/**
 * Registers the modal status bar content for segmentation-mode tools.
 * Routes among Brush / Pen / AI sub-modes. Select (and the future Merge
 * tool) currently have no status content.
 */
export const useSegmentationStatus = () => {
  const { setContent } = useModalStatusBar();
  const segmentationModeActive = useAtomValue(
    _unsafeSegmentationModeActiveAtom
  );
  const tool = useAtomValue(_unsafeToolAtom);
  const aiContent = useAIAnnotationStatusContent();

  const content = useMemo<StatusContent>(() => {
    if (!segmentationModeActive) return null;
    switch (tool) {
      case SegmentationTool.Brush:
        return (
          <StatusItem
            icon={<Brush fontSize="small" />}
            label="Paint to create a mask"
          />
        );
      case SegmentationTool.Pen:
        return (
          <StatusItem
            icon={<Timeline fontSize="small" />}
            label="Draw freeform to create a filled mask"
          />
        );
      case SegmentationTool.AI:
        return aiContent;
      // TODO: SegmentationTool.Merge when the merge tool lands
      default:
        return null;
    }
  }, [segmentationModeActive, tool, aiContent]);

  useEffect(() => {
    if (content === null) return undefined;
    setContent(content);
    return () => {
      setContent(null);
    };
  }, [content, setContent]);
};
