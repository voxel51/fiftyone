import { useReverbValue } from "@fiftyone/reverb";
import * as fos from "@fiftyone/state";

type SimilarityTypeProp = {
  isImageSearch: boolean;
};
// returns the helpertext and icon type based on the similarity sort type (text or image)
const useSimilarityType = (props: SimilarityTypeProp) => {
  const hasSelectedSamples = useReverbValue(fos.hasSelectedSamples);
  const hasSelectedLabels = useReverbValue(fos.hasSelectedLabels);
  const modal = useReverbValue(fos.isModalActive);
  const hasSorting = Boolean(useReverbValue(fos.similarityParameters));

  const isImageSearch =
    hasSelectedSamples ||
    (props.isImageSearch && hasSorting) ||
    (modal && hasSelectedLabels);

  const text = isImageSearch
    ? "Search by image similarity"
    : "Sort by text similarity";

  return { text, showImageSimilarityIcon: isImageSearch };
};

export default useSimilarityType;
