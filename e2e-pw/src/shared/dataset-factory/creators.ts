/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createId } from "../utils";
import { build } from "./build";
import {
  frameSpecs,
  generateMedia,
  helpers,
  imageMedia,
  indices,
  mcapMedia,
  resolve,
  sceneMedia,
  videoMedia,
} from "./media";
import type {
  Dataset3dOptions,
  DatasetOptions,
  GroupDatasetOptions,
  GroupSliceConfig,
  ImageDatasetOptions,
  MediaType,
  MultimodalDatasetOptions,
  VideoDatasetOptions,
} from "./types";

/**
 * Creates a FiftyOne dataset whose media kind is chosen by `mediaType`
 * (default `"image"`); every kind inserts fixed-id documents directly and
 * applies `schema`, `labelSchemas` and `savedViews`. See the per-media
 * creators below for the media each kind generates.
 *
 * @example
 * await DatasetFactory.createDataset({
 *   datasetName: "my-dataset",
 *   numSamples: 10,
 *   numbered: true,
 *   imageOptions: { fillColor: "black", width: 128, height: 128 },
 *   schema: { hello: "StringField" },
 *   withSampleData: ({ index }, { createId }) => ({ _id: createId(indexToId(index)), hello: "world"  }),
 * });
 * await DatasetFactory.createDataset({ mediaType: "video", datasetName: "my-videos" });
 */
export const createDataset = async <M extends MediaType = "image">(
  options: DatasetOptions<M>,
) => {
  const resolved = options as DatasetOptions<MediaType>;
  switch (resolved.mediaType) {
    case "video":
      return createVideoDataset(resolved);
    case "3d":
      return create3dDataset(resolved);
    case "group":
      return createGroupDataset(resolved);
    case "multimodal":
      return createMultimodalDataset(resolved);
    default:
      return createImageDataset(resolved);
  }
};

/**
 * Generated PNG samples at `<tmpdir>/<datasetName>/<index>.png`, with an
 * `index` field on every sample.
 *
 * @throws {Error} If `numSamples` is less than 1 or not an integer.
 */
const createImageDataset = async ({
  datasetName,
  imageOptions,
  labelSchemas,
  numSamples = 1,
  numbered = false,
  savedViews,
  schema = {},
  withSampleData = () => ({}),
}: ImageDatasetOptions) => {
  if (!Number.isInteger(numSamples)) {
    throw new Error(
      `Expected 'numSamples' to be an integer, but got ${numSamples}`,
    );
  }

  if (numSamples < 1 || numSamples > 100) {
    throw new Error(`'numSamples' must be >0 and <=100, but got ${numSamples}`);
  }

  const media = await generateMedia(datasetName, indices(numSamples), (index) =>
    imageMedia({
      watermarkString: numbered ? index.toString() : undefined,
      fillColor: "white",
      ...resolve(imageOptions, index),
    }),
  );

  await build({
    datasetName,
    mediaType: "image",
    samples: media.map(({ _id, filepath, index }) => ({
      id: _id,
      filepath,
      data: { index, ...withSampleData({ _id, filepath, index }, helpers) },
    })),
    schema: { index: "IntField", ...schema },
    labelSchemas,
    savedViews,
  });
};

const DEFAULT_GROUP_SLICES: GroupSliceConfig[] = [
  { name: "left", mediaType: "image" },
  { name: "right", mediaType: "image" },
  { name: "3d", mediaType: "3d" },
];

/**
 * Group dataset: image slices are generated PNGs, 3D slices a PLY mesh wrapped
 * in a `.fo3d` scene, video slices generated clips. The default layout is
 * `left` (image), `right` (image) and `3d`.
 *
 * @example
 * await DatasetFactory.createDataset({
 *   mediaType: "group",
 *   datasetName: "my-groups",
 *   numGroups: 4,
 *   slices: [
 *     { name: "left", mediaType: "image" },
 *     { name: "pcd", mediaType: "3d" },
 *   ],
 * });
 */
const createGroupDataset = async ({
  datasetName,
  imageOptions = {
    fillColor: "#22577a",
    width: 128,
    height: 128,
    hideLogs: true,
  },
  labelSchemas,
  numGroups = 3,
  sampleFrames = false,
  savedViews,
  sceneOptions = { meshes: [{ color: [96, 208, 255] }] },
  schema,
  slices = DEFAULT_GROUP_SLICES,
  videoOptions,
  withFrameData,
  withSampleData = () => ({}),
}: GroupDatasetOptions) => {
  const entries = Array.from({ length: numGroups }, (_, groupIndex) => {
    const groupId = createId().$oid;
    return slices.map((slice) => ({ groupId, groupIndex, slice }));
  }).flat();

  const media = await generateMedia(
    datasetName,
    entries.map(({ slice, groupIndex }) => `${slice.name}-${groupIndex}`),
    (index) => {
      const { slice } = entries[index];
      switch (slice.mediaType) {
        case "image":
          return imageMedia({
            ...resolve(imageOptions, index),
            ...slice.imageOptions,
          });
        case "video":
          return videoMedia({
            ...resolve(videoOptions, index),
            ...slice.videoOptions,
          });
        default:
          return sceneMedia({
            ...resolve(sceneOptions, index),
            ...slice.sceneOptions,
          });
      }
    },
  );

  await build({
    datasetName,
    mediaType: "group",
    groupSlices: slices,
    samples: media.map(({ _id, filepath, index, numFrames }) => {
      const { groupId, groupIndex, slice } = entries[index];
      return {
        id: _id,
        filepath,
        group: { id: groupId, name: slice.name },
        data: withSampleData(
          { _id, filepath, index, groupIndex, slice: slice.name, numFrames },
          helpers,
        ),
      };
    }),
    frames: media.flatMap(({ _id, index, numFrames }) =>
      numFrames === undefined
        ? []
        : frameSpecs(_id, index, numFrames, withFrameData),
    ),
    sampleFrames,
    schema,
    labelSchemas,
    savedViews,
  });
};

/**
 * Video dataset with generated solid-color clips, one per sample, at
 * `<tmpdir>/<datasetName>/<index>.<container>`. Frame documents are inserted
 * when `withFrameData` is given, before `compute_metadata()` and the optional
 * `to_frames(sample_frames=True)` that fills the frame images into them.
 *
 * @example
 * await DatasetFactory.createDataset({
 *   mediaType: "video",
 *   datasetName: "my-videos",
 *   videoOptions: { duration: 4 },
 *   schema: { "frames.detections": "Detections" },
 *   withFrameData: () => ({ detections: { _cls: "Detections", detections: [] } }),
 *   sampleFrames: true,
 * });
 */
const createVideoDataset = async ({
  datasetName,
  labelSchemas,
  numSamples = 1,
  sampleFrames = false,
  savedViews,
  schema,
  videoOptions,
  withFrameData,
  withSampleData = () => ({}),
}: VideoDatasetOptions) => {
  const media = await generateMedia(datasetName, indices(numSamples), (index) =>
    videoMedia({ ...resolve(videoOptions, index) }),
  );

  await build({
    datasetName,
    mediaType: "video",
    samples: media.map(({ _id, filepath, index, numFrames }) => ({
      id: _id,
      filepath,
      data: withSampleData({ _id, filepath, index, numFrames }, helpers),
    })),
    frames: media.flatMap(({ _id, index, numFrames }) =>
      frameSpecs(_id, index, numFrames, withFrameData),
    ),
    sampleFrames,
    schema,
    labelSchemas,
    savedViews,
  });
};

/**
 * 3D dataset with one generated `.fo3d` scene (a PLY cube) per sample at
 * `<tmpdir>/<datasetName>/<index>.fo3d`.
 *
 * @example
 * await DatasetFactory.createDataset({
 *   mediaType: "3d",
 *   datasetName: "my-scenes",
 *   schema: { detections: "Detections" },
 *   withSampleData: (_, { createId }) => ({
 *     detections: {
 *       _cls: "Detections",
 *       detections: [{ _id: createId(), _cls: "Detection", label: "car", location: [0, 0, 0] }],
 *     },
 *   }),
 * });
 */
const create3dDataset = async ({
  datasetName,
  labelSchemas,
  numSamples = 1,
  savedViews,
  sceneOptions,
  schema,
  withSampleData = () => ({}),
}: Dataset3dOptions) => {
  const media = await generateMedia(datasetName, indices(numSamples), (index) =>
    sceneMedia({ ...resolve(sceneOptions, index) }),
  );

  await build({
    datasetName,
    mediaType: "3d",
    samples: media.map(({ _id, filepath, index }) => ({
      id: _id,
      filepath,
      data: withSampleData({ _id, filepath, index }, helpers),
    })),
    schema,
    labelSchemas,
    savedViews,
  });
};

/**
 * Multimodal dataset with one generated MCAP recording per sample at
 * `<tmpdir>/<datasetName>/<index>.mcap`.
 *
 * @example
 * await DatasetFactory.createDataset({ mediaType: "multimodal", datasetName: "my-episodes" });
 */
const createMultimodalDataset = async ({
  datasetName,
  labelSchemas,
  mcapOptions,
  numSamples = 1,
  savedViews,
  schema,
  withSampleData = () => ({}),
}: MultimodalDatasetOptions) => {
  const media = await generateMedia(datasetName, indices(numSamples), (index) =>
    mcapMedia({ kind: "tiny-episode-a", ...resolve(mcapOptions, index) }),
  );

  await build({
    datasetName,
    mediaType: "multimodal",
    samples: media.map(({ _id, filepath, index }) => ({
      id: _id,
      filepath,
      data: withSampleData({ _id, filepath, index }, helpers),
    })),
    schema,
    labelSchemas,
    savedViews,
  });
};
