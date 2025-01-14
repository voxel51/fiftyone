import { getDenseLabelNames, Schema } from "@fiftyone/utilities";

export const computeDefaultVisibleLabels = (
  sampleSchema: Schema,
  frameSchema: Schema,
  allSampleLabels: string[],
  allFrameLabels: string[],
  defaultVisibleLabelsConfig?: {
    include?: string[];
    exclude?: string[];
  }
) => {
  const denseLabelsSamples = getDenseLabelNames(sampleSchema);
  const denseLabelsFrames = getDenseLabelNames(frameSchema).map(
    (l) => `frames.${l}`
  );
  const denseLabels = [...denseLabelsSamples, ...denseLabelsFrames];

  const allLabels = [...allSampleLabels, ...allFrameLabels];

  // if no include/exclude is defined
  if (
    !defaultVisibleLabelsConfig?.include &&
    !defaultVisibleLabelsConfig?.exclude
  ) {
    const all = allLabels.filter((label) => !denseLabels.includes(label));
    console.log("all", all);
    return all;
  }

  // if only include is defined
  if (
    defaultVisibleLabelsConfig?.include &&
    !defaultVisibleLabelsConfig?.exclude
  ) {
    return allLabels.filter((label) =>
      defaultVisibleLabelsConfig.include.includes(label)
    );
  }

  // if only exclude is defined
  if (
    !defaultVisibleLabelsConfig?.include &&
    defaultVisibleLabelsConfig?.exclude
  ) {
    return allLabels.filter(
      (label) => !defaultVisibleLabelsConfig.exclude.includes(label)
    );
  }

  // if both include and exclude are defined
  const includeList = new Set(defaultVisibleLabelsConfig.include);
  const excludeList = new Set(defaultVisibleLabelsConfig.exclude);
  // resolved = set(include) - set(exclude)
  const resolved = new Set([...includeList].filter((x) => !excludeList.has(x)));
  return allLabels.filter((label) => resolved.has(label));
};
