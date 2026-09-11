/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { DatasetFactory } from ".";

/** Compile-time checks that `mediaType` narrows `createDataset`'s options. */
declare const factory: typeof DatasetFactory;

void factory.createDataset({
  datasetName: "images",
  imageOptions: { width: 1 },
  withSampleData: ({ index }) => ({ index }),
});

void factory.createDataset({
  mediaType: "video",
  datasetName: "videos",
  videoOptions: { duration: 1 },
  withSampleData: ({ numFrames }) => ({ numFrames }),
  withFrameData: ({ frameNumber }) => ({ frameNumber }),
});

void factory.createDataset({
  mediaType: "group",
  datasetName: "groups",
  withSampleData: ({ slice }) => ({ slice }),
});

void factory.createDataset({
  datasetName: "images",
  // @ts-expect-error `videoOptions` requires `mediaType: "video"`.
  videoOptions: { duration: 1 },
});

void factory.createDataset({
  mediaType: "image",
  datasetName: "images",
  // @ts-expect-error `videoOptions` requires `mediaType: "video"`.
  videoOptions: { duration: 1 },
});

void factory.createDataset({
  mediaType: "3d",
  datasetName: "scenes",
  // @ts-expect-error `imageOptions` requires an image or group dataset.
  imageOptions: { width: 1 },
});

void factory.createDataset({
  datasetName: "images",
  // @ts-expect-error `numFrames` only exists on the video scaffold.
  withSampleData: ({ numFrames }) => ({ numFrames }),
});

// @ts-expect-error A non-image dataset must name its `mediaType`.
void factory.createDataset({ datasetName: "videos", sampleFrames: true });
