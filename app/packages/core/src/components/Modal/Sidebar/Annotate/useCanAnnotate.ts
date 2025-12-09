import { isGeneratedView, mediaType, readOnly } from "@fiftyone/state";
import { isAnnotationSupported } from "@fiftyone/utilities";
import { useRecoilValue } from "recoil";
import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";

export type AnnotationDisabledReason =
  | "generatedView"
  | "groupedDataset"
  | "videoDataset"
  | null;

export interface CanAnnotateResult {
  /** Whether to show the annotation tab at all */
  showAnnotationTab: boolean;
  /** If tab is shown but disabled, the reason why */
  disabledReason: AnnotationDisabledReason;
}

const MEDIA_TYPE_TO_DISABLED_REASON: Record<string, AnnotationDisabledReason> =
  {
    group: "groupedDataset",
    video: "videoDataset",
  };

function getDisabledReason(
  currentMediaType: string | null | undefined,
  isGenerated: boolean
): AnnotationDisabledReason {
  if (isGenerated) return "generatedView";
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

  // hide tab entirely for read-only or feature disabled
  if (isReadOnly || !isAnnotationEnabled) {
    return { showAnnotationTab: false, disabledReason: null };
  }

  return {
    showAnnotationTab: true,
    disabledReason: getDisabledReason(currentMediaType, isGenerated),
  };
}
