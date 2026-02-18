import {
  canAnnotate,
  isGeneratedView,
  isGroup,
  isPatchesView,
  mediaType,
  readOnly,
} from "@fiftyone/state";
import { isAnnotationSupported } from "@fiftyone/utilities";
import { useRecoilValue } from "recoil";
import { useGroupAnnotationSlices } from "./useGroupAnnotationSlices";

export type AnnotationDisabledReason =
  | "generatedView"
  | "groupedDatasetNoSupportedSlices"
  | "videoDataset"
  | null;

export interface CanAnnotateResult {
  /** Whether to show the annotation tab at all */
  showAnnotationTab: boolean;
  /** If tab is shown but disabled, the reason why */
  disabledReason: AnnotationDisabledReason;
  /** Whether this is a grouped dataset (to show slice selector) */
  isGroupedDataset: boolean;
}

const MEDIA_TYPE_TO_DISABLED_REASON: Partial<
  Record<
    string,
    Exclude<
      AnnotationDisabledReason,
      "generatedView" | "groupedDatasetNoSupportedSlices" | null
    >
  >
> = {
  video: "videoDataset",
};

function getDisabledReason(
  currentMediaType: string | null | undefined,
  isGenerated: boolean,
  isGrouped: boolean,
  hasSupportedSlices: boolean
): AnnotationDisabledReason {
  if (isGenerated) return "generatedView";

  if (isGrouped) {
    return hasSupportedSlices ? null : "groupedDatasetNoSupportedSlices";
  }

  if (currentMediaType && !isAnnotationSupported(currentMediaType)) {
    return MEDIA_TYPE_TO_DISABLED_REASON[currentMediaType] ?? null;
  }
  return null;
}

export default function useCanAnnotate(): CanAnnotateResult {
  const isReadOnlySnapshot = useRecoilValue(readOnly);
  const { enabled: canAnnotateEnabled } = useRecoilValue(canAnnotate);
  const currentMediaType = useRecoilValue(mediaType);
  const isGenerated = useRecoilValue(isGeneratedView);
  const isGroupedDataset = useRecoilValue(isGroup);
  const { supportedSlices } = useGroupAnnotationSlices();

  const hasSupportedSlices = supportedSlices.length > 0;
  const isPatches = useRecoilValue(isPatchesView);
  const isUnsupportedGeneratedView = isGenerated && !isPatches;

  // hide tab entirely if user lacks edit permission or feature disabled
  if (isReadOnlySnapshot || !canAnnotateEnabled) {
    return {
      showAnnotationTab: false,
      disabledReason: null,
      isGroupedDataset: isGroupedDataset,
    };
  }

  return {
    isGroupedDataset,
    showAnnotationTab: true,
    disabledReason: getDisabledReason(
      currentMediaType,
      isUnsupportedGeneratedView,
      isGroupedDataset,
      hasSupportedSlices
    ),
  };
}
