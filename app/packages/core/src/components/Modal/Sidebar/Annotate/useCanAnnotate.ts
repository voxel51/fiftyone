import {
  canAnnotate,
  isGeneratedView,
  isPatchesView,
  mediaType,
  readOnly,
  useGroupSlices,
  useIsDynamicGroup,
  useIsGroupDataset,
  useIsNestedDynamicGroup,
  useIsQueryPerformantDynamicGroup,
  useParentMediaType,
} from "@fiftyone/state";
import { isAnnotationSupported, isMultimodal } from "@fiftyone/utilities";
import { useRecoilValue } from "recoil";

/**
 * Returns true if the current group dataset has at least one slice with a
 * media type that supports annotation (image, video, or 3D).
 */
function useHasAnnotationSupportedSlices(): boolean {
  return useGroupSlices(["image", "video", "3d"]).length > 0;
}

export type AnnotationDisabledReason =
  | "generatedView"
  | "groupDatasetNoSupportedSlices"
  | "videoDataset"
  | "multimodalDataset"
  | "dynamicGroupNotQueryPerformant"
  | null;

export interface CanAnnotateResult {
  /** Whether to show the annotation tab at all */
  showAnnotationTab: boolean;
  /** If tab is shown but disabled, the reason why */
  disabledReason: AnnotationDisabledReason;
}

export default function useCanAnnotate(): CanAnnotateResult {
  const isReadOnlySnapshot = useRecoilValue(readOnly);
  const { enabled: canAnnotateEnabled } = useRecoilValue(canAnnotate);
  const currentMediaType = useRecoilValue(mediaType);
  const isGenerated = useRecoilValue(isGeneratedView);

  const isPatches = useRecoilValue(isPatchesView);
  const isUnsupportedGeneratedView = isGenerated && !isPatches;
  const hasSlices = useHasAnnotationSupportedSlices();
  const isGroup = useIsGroupDataset();
  const isDynamic = useIsDynamicGroup();
  const isNestedDynamic = useIsNestedDynamicGroup();
  const isQueryPerformant = useIsQueryPerformantDynamicGroup();
  // a dynamic group view reports the "group" media type; its members' type is
  // what annotation support depends on. Nested groups keep the dataset logic.
  const isDynamicVideo = isDynamic && !isNestedDynamic;
  const parentMediaType = useParentMediaType();
  const memberMediaType = isDynamicVideo ? parentMediaType : currentMediaType;

  // hide tab entirely if user lacks edit permission or feature disabled
  if (isReadOnlySnapshot || !canAnnotateEnabled) {
    return {
      showAnnotationTab: false,
      disabledReason: null,
    };
  }

  if ((!isGroup || isDynamicVideo) && isMultimodal(memberMediaType)) {
    return {
      showAnnotationTab: true,
      disabledReason: "multimodalDataset",
    };
  }

  if (isGenerated && isUnsupportedGeneratedView) {
    return {
      showAnnotationTab: true,
      disabledReason: "generatedView",
    };
  }

  if (isDynamicVideo) {
    return {
      showAnnotationTab: true,
      disabledReason: isQueryPerformant
        ? null
        : "dynamicGroupNotQueryPerformant",
    };
  }

  if (isGroup && !hasSlices) {
    return {
      showAnnotationTab: true,
      disabledReason: "groupDatasetNoSupportedSlices",
    };
  }

  if (!isGroup && !isAnnotationSupported(currentMediaType)) {
    return {
      showAnnotationTab: true,
      disabledReason: "videoDataset",
    };
  }

  return {
    showAnnotationTab: true,
    disabledReason: null,
  };
}
