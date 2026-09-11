import { useAnnotationEngine, useEngineSelector } from "@fiftyone/annotation";
import { useEffect } from "react";

/**
 * Run `onChange` whenever the id set or resolved label type of the sample-level
 * labels under `paths` changes; `frames.*` paths are ignored. Fires once the
 * first label is resolvable and again when its type settles.
 */
export const useOnSampleLevelLabelsChange = (
  sampleId: string,
  paths: ReadonlySet<string>,
  onChange: () => void,
): void => {
  const engine = useAnnotationEngine();

  const signature = useEngineSelector(engine, (reads) => {
    return [...paths]
      .filter((path) => !path.startsWith("frames."))
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
