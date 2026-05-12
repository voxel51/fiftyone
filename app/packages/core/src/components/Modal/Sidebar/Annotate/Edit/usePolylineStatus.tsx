import type { PolylineAnnotationLabel } from "@fiftyone/state";
import Timeline from "@mui/icons-material/Timeline";
import { useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import {
  StatusContent,
  StatusItem,
  useModalStatusBar,
} from "../../../ModalStatusBar";
import { currentData } from "./state";
import { _unsafePolylineModeActiveAtom } from "./usePolylineMode";

const countVertices = (
  points: PolylineAnnotationLabel["data"]["points"] | undefined
): number => points?.reduce((total, segment) => total + segment.length, 0) ?? 0;

/**
 * Registers the modal status bar content for 2D polyline annotation mode.
 *
 * - When polyline mode is on with no polyline selected, shows the entry hint.
 * - When a polyline is selected (drawing in progress), shows the live
 *   vertex count and finish-gesture hint.
 */
export const usePolylineStatus = () => {
  const { setContent } = useModalStatusBar();
  const polylineModeActive = useAtomValue(_unsafePolylineModeActiveAtom);
  const data = useAtomValue(currentData) as
    | PolylineAnnotationLabel["data"]
    | null;
  const vertexCount = countVertices(data?.points);

  const content = useMemo<StatusContent>(() => {
    if (!polylineModeActive) return null;
    if (vertexCount === 0) {
      return (
        <StatusItem
          icon={<Timeline fontSize="small" />}
          label="Click to draw another polyline · Click existing shape to edit"
        />
      );
    }
    return (
      <StatusItem
        icon={<Timeline fontSize="small" />}
        label={`${vertexCount} ${
          vertexCount === 1 ? "vertex" : "vertices"
        } · Right click to finish`}
      />
    );
  }, [polylineModeActive, vertexCount]);

  useEffect(() => {
    if (content === null) return undefined;
    setContent(content);
    return () => {
      setContent(null);
    };
  }, [content, setContent]);
};
