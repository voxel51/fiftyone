import { readOnly } from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";

export default function useCanAnnotate() {
  const isReadOnly = useRecoilValue(readOnly);
  const { isEnabled: isAnnotationEnabled } = useFeature({
    feature: FeatureFlag.EXPERIMENTAL_ANNOTATION,
  });
  return !isReadOnly && isAnnotationEnabled;
}
