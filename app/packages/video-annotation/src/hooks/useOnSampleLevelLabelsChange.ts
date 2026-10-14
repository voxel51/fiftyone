/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAnnotationEngine, useEngineSelector } from "@fiftyone/annotation";
import { useIsImageDynamicGroupVideo } from "@fiftyone/state";
import { useEffect } from "react";
import { isFrameScopedPath } from "../state/framePaths";

/**
 * Run `onChange` whenever the id set or resolved label type of the sample-level
 * labels under `paths` changes; frame-scoped paths are ignored. Fires once the
 * first label is resolvable and again when its type settles.
 */
export const useOnSampleLevelLabelsChange = (
  sampleId: string,
  paths: ReadonlySet<string>,
  onChange: () => void,
): void => {
  const engine = useAnnotationEngine();
  const isImageDynamicGroupVideo = useIsImageDynamicGroupVideo();

  const signature = useEngineSelector(engine, (reads) => {
    return [...paths]
      .filter((path) => !isFrameScopedPath(path, isImageDynamicGroupVideo))
      .sort()
      .map((path) => {
        const ids = reads
          .listLabels({ sample: sampleId, path })
          .map((label) => label._id)
          .join(",");

        return `${path}:${reads.getLabelType(path)}:${ids}`;
      })
      .join("|");
  });

  useEffect(() => {
    if (!signature) {
      return;
    }

    onChange();
  }, [signature, onChange]);
};
