import type { Schema } from "@fiftyone/utilities";
import { getDenseLabelNames } from "@fiftyone/utilities";

export const computeActiveFields = (
  paths: string[],
  sampleSchema: Schema,
  frameSchema: Schema,
  allSampleLabels: string[],
  allFrameLabels: string[],
  config?: {
    readonly exclude: boolean | null;
    readonly paths: ReadonlyArray<string> | null;
  }
) => {
  const allLabels = [...allSampleLabels, ...allFrameLabels];
  const denseLabelsFrames = getDenseLabelNames(frameSchema).map(
    (l) => `frames.${l}`
  );
  const denseLabelsSamples = getDenseLabelNames(sampleSchema);
  const denseLabels = [...denseLabelsSamples, ...denseLabelsFrames];

  // if no include/exclude is defined
  if (!config?.paths.length && !config?.exclude) {
    return allLabels.filter((label) => !denseLabels.includes(label));
  }

  // if the paths are excluded
  if (config?.exclude) {
    return paths.filter((path) => !config.paths.includes(path));
  }

  return paths.filter((path) => config.paths.includes(path));
};
