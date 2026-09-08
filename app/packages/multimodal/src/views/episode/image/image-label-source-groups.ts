import type { SceneSource } from "../../../ir";
import { findBestMatchingAnnotationStreams } from "../../../stream-selection";

interface ImageLabelSourceGroups {
  readonly matching: readonly SceneSource[];
  readonly remaining: readonly SceneSource[];
}

/** Groups annotation sources by semantic source name while retaining IDs. */
export function groupImageLabelSources(
  imageSource: SceneSource | null,
  annotationSources: readonly SceneSource[],
): ImageLabelSourceGroups {
  const matchingSourceNames = new Set(
    imageSource
      ? findBestMatchingAnnotationStreams(
          imageSource.sourceName,
          annotationSources.map((source) => source.sourceName),
        )
      : [],
  );

  return {
    matching: annotationSources.filter((source) =>
      matchingSourceNames.has(source.sourceName),
    ),
    remaining: annotationSources.filter(
      (source) => !matchingSourceNames.has(source.sourceName),
    ),
  };
}
