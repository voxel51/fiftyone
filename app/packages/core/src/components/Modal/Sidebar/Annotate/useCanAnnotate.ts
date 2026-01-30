import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
import { isGeneratedView, isGroup, mediaType, readOnly } from "@fiftyone/state";
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
  const isReadOnly = useRecoilValue(readOnly);
  const { isEnabled: isAnnotationEnabled } = useFeature({
    feature: FeatureFlag.EXPERIMENTAL_ANNOTATION,
  });
  const currentMediaType = useRecoilValue(mediaType);
  const isGenerated = useRecoilValue(isGeneratedView);
  const isGroupedDataset = useRecoilValue(isGroup);
  const { supportedSlices } = useGroupAnnotationSlices();

  const hasSupportedSlices = supportedSlices.length > 0;

  // hide tab entirely for read-only or feature disabled
  if (isReadOnly || !isAnnotationEnabled) {
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
      isGenerated,
      isGroupedDataset,
      hasSupportedSlices
    ),
  };
}
