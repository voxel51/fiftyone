import {
  canAnnotate,
  isGeneratedView,
  isNestedDynamicGroup,
  isDynamicGroup,
  isPatchesView,
  isQueryPerformantDynamicGroup,
  mediaType,
  readOnly,
  useGroupSlices,
  useIsGroupDataset,
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
  const isDynamic = useRecoilValue(isDynamicGroup);
  const isNestedDynamic = useRecoilValue(isNestedDynamicGroup);
  const isQueryPerformant = useRecoilValue(isQueryPerformantDynamicGroup);

  // hide tab entirely if user lacks edit permission or feature disabled
  if (isReadOnlySnapshot || !canAnnotateEnabled) {
    return {
      showAnnotationTab: false,
      disabledReason: null,
    };
  }

  // nested dynamic groups fall through to the group dataset logic below
  if (isDynamic && !isNestedDynamic) {
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

  if (!isGroup && isMultimodal(currentMediaType)) {
    return {
      showAnnotationTab: true,
      disabledReason: "multimodalDataset",
    };
  }

  if (!isGroup && !isAnnotationSupported(currentMediaType)) {
    return {
      showAnnotationTab: true,
      disabledReason: "videoDataset",
    };
  }

  if (isGenerated && isUnsupportedGeneratedView) {
    return {
      showAnnotationTab: true,
      disabledReason: "generatedView",
    };
  }

  return {
    showAnnotationTab: true,
    disabledReason: null,
  };
}
