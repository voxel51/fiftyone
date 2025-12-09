import { isGeneratedView, mediaType, readOnly } from "@fiftyone/state";
import { isAnnotationSupported } from "@fiftyone/utilities";
import { useRecoilValue } from "recoil";
import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";

export type AnnotationDisabledReason =
  | "generatedView"
  | "unsupportedMediaType"
  | null;

export interface CanAnnotateResult {
  /** Whether to show the annotation tab at all */
  showAnnotationTab: boolean;
  /** If tab is shown but disabled, the reason why */
  disabledReason: AnnotationDisabledReason;
}

export default function useCanAnnotate(): CanAnnotateResult {
  const isReadOnly = useRecoilValue(readOnly);
  const { isEnabled: isAnnotationEnabled } = useFeature({
    feature: FeatureFlag.EXPERIMENTAL_ANNOTATION,
  });
  const currentMediaType = useRecoilValue(mediaType);
  const isGenerated = useRecoilValue(isGeneratedView);

  // Original behavior: hide tab entirely for read-only or feature disabled
  if (isReadOnly || !isAnnotationEnabled) {
    return { showAnnotationTab: false, disabledReason: null };
  }

  // New behavior: show tab but with disabled message
  if (isGenerated) {
    return { showAnnotationTab: true, disabledReason: "generatedView" };
  }

  if (!isAnnotationSupported(currentMediaType)) {
    return {
      showAnnotationTab: true,
      disabledReason:
        currentMediaType === "group" ? "unsupportedMediaType" : null,
    };
  }

  return { showAnnotationTab: true, disabledReason: null };
}
