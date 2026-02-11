import { useEffect, useMemo } from "react";
import styled from "styled-components";
import { PANEL_ID_SIDE_TOP, VIEW_TYPE_LEFT, VIEW_TYPE_TOP } from "../constants";
import { useFetchFrustumParameters } from "../frustum/hooks/internal/useFetchFrustumParameters";
import type { SidePanelId, SidePanelViewType } from "../types";
import { Projected3dOverlays } from "./projection";

const ImageSliceContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #000;
`;

const ImageSliceImg = styled.img`
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
`;

// Image slice prefix to distinguish them from cardinal views
const IMAGE_SLICE_PREFIX = "slice_";

/**
 * Check if a view string represents an image slice (prefixed with "slice_")
 */
export const isImageSliceView = (view: SidePanelViewType): boolean => {
  return typeof view === "string" && view.startsWith(IMAGE_SLICE_PREFIX);
};

/**
 * Encode an image slice name into a view string by prefixing it.
 * Example: "camera_01" -> "slice_camera_01"
 */
export const encodeImageSliceView = (sliceName: string): string => {
  return `slice_${sliceName}`;
};

/**
 * Extract the original image slice name from a prefixed view string.
 * Example: "slice_camera_01" -> "camera_01"
 * Returns null if the view is not an image slice.
 */
const decodeImageSliceView = (view: SidePanelViewType): string | null => {
  if (!isImageSliceView(view)) {
    return null;
  }
  return view.slice(IMAGE_SLICE_PREFIX.length);
};

/**
 * Check if a specific image slice is available in the current imageSlices array.
 */
const isImageSliceAvailable = (
  view: SidePanelViewType,
  availableSlices: string[]
): boolean => {
  const sliceName = decodeImageSliceView(view);
  if (!sliceName) {
    return false;
  }
  return availableSlices.includes(sliceName);
};

/**
 * Get the default cardinal view based on panel position.
 * Top panel defaults to "Top" view, bottom panel defaults to "Left" view.
 */
const getDefaultViewForPanel = (panelId: SidePanelId): SidePanelViewType => {
  return panelId === PANEL_ID_SIDE_TOP ? VIEW_TYPE_TOP : VIEW_TYPE_LEFT;
};

export interface ImageSlicePanelProps {
  panelId: SidePanelId;
  view: SidePanelViewType;
  setView: (view: SidePanelViewType) => void;
  imageSlices: string[];
  isLoadingImageSlices: boolean;
  resolveUrlForImageSlice: (sliceName: string) => string | null;
}

/**
 * Renders an image slice view with projection overlays.
 * Handles validation and resets to cardinal view if slice is no longer available.
 *
 * Returns null if the view is not an image slice view or if the slice is not available.
 */
export const ImageSlicePanel = ({
  panelId,
  view,
  setView,
  imageSlices,
  isLoadingImageSlices,
  resolveUrlForImageSlice,
}: ImageSlicePanelProps) => {
  const { data: frustumData } = useFetchFrustumParameters();

  // Find the frustum data matching the current image-slice view
  const activeFrustum = useMemo(() => {
    const sliceName = decodeImageSliceView(view);
    if (!sliceName) return null;
    return frustumData.find((f) => f.sliceName === sliceName) ?? null;
  }, [frustumData, view]);

  /**
   * Validation effect: restore view to a cardinal view only if absolutely certain
   * the stored image slice is no longer available.
   *
   * We optimistically assume a slice view is valid. Only reset if:
   * 1. Loading of image slices is complete AND
   * 2. We have a non-empty list of available slices AND
   * 3. The slice is definitely not in that list
   *
   * This avoids resetting during async loading or if fetch temporarily fails.
   */
  useEffect(() => {
    // Still loading, trust the stored view optimistically
    if (isLoadingImageSlices) return;

    // Loading complete with actual slice data
    if (isImageSliceView(view) && imageSlices.length > 0) {
      // Only reset if we have a populated list AND the slice is not in it
      if (!isImageSliceAvailable(view, imageSlices)) {
        const defaultView = getDefaultViewForPanel(panelId);
        console.warn(
          `Image slice view "${view}" is no longer available. Falling back to "${defaultView}" view.`,
          { view, availableSlices: imageSlices }
        );
        setView(defaultView);
        return;
      }
    }
  }, [isLoadingImageSlices, imageSlices, view, setView, panelId]);

  // Don't render if this is not a slice view or slice is not available
  if (!isImageSliceView(view) || !isImageSliceAvailable(view, imageSlices)) {
    return null;
  }

  const imageUrl = resolveUrlForImageSlice(decodeImageSliceView(view)!);
  if (!imageUrl) {
    return null;
  }

  return (
    <ImageSliceContainer>
      <ImageSliceImg src={imageUrl} />
      {activeFrustum && (
        <Projected3dOverlays frustumData={activeFrustum} panelId={panelId} />
      )}
    </ImageSliceContainer>
  );
};
