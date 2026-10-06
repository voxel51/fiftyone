/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { indexToId } from "../utils";
import { build, type BuildOptions } from "./build";
import {
  frameSpecs,
  generateMedia,
  imageMedia,
  makeHelpers,
  indices,
  mcapMedia,
  mediaFieldValues,
  pcdMedia,
  resolve,
  sceneMedia,
  videoMedia,
} from "./media";
import type {
  BaseDatasetOptions,
  CreatedSample,
  Dataset3dOptions,
  DatasetOptions,
  GroupDatasetOptions,
  GroupSliceConfig,
  ImageDatasetOptions,
  MediaType,
  MultimodalDatasetOptions,
  PointCloudDatasetOptions,
  SampleSpec,
  VideoDatasetOptions,
} from "./types";

/**
 * Creates a FiftyOne dataset whose media kind is chosen by `mediaType`
 * (default `"image"`); every kind inserts fixed-id documents directly and
 * applies `schema`, `labelSchemas`, `appConfig` and `savedViews`. See the
 * per-media creators below for the media each kind generates. Resolves with
 * the inserted samples' ids and filepaths, in insertion order.
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
): Promise<CreatedSample[]> => {
  const resolved = options as DatasetOptions<MediaType>;
  switch (resolved.mediaType) {
    case "video":
      return createVideoDataset(resolved);
    case "3d":
      return create3dDataset(resolved);
    case "point-cloud":
      return createPointCloudDataset(resolved);
    case "group":
      return createGroupDataset(resolved);
    case "multimodal":
      return createMultimodalDataset(resolved);
    default:
      return createImageDataset(resolved);
  }
};

/**
 * Builds the dataset from its samples, with the options every kind shares,
 * after generating the `mediaFields` images and declaring their fields.
 */
const buildWith = async (
  options: BaseDatasetOptions<never>,
  build_: Omit<BuildOptions, keyof BaseDatasetOptions | "datasetName"> &
    Pick<BuildOptions, "schema">,
): Promise<CreatedSample[]> => {
  const {
    appConfig,
    datasetName,
    indexes,
    labelSchemas,
    mediaFields = {},
    promptableIndexes,
    savedViews,
    staticTransforms,
  } = options;
  const fieldValues = await mediaFieldValues(
    datasetName,
    build_.samples.length,
    mediaFields,
  );
  await build({
    ...build_,
    samples: build_.samples.map((sample, index) => ({
      ...sample,
      data: { ...fieldValues[index], ...sample.data },
    })),
    schema: {
      ...Object.fromEntries(
        Object.keys(mediaFields).map((field) => [field, "StringField"]),
      ),
      ...build_.schema,
    },
    appConfig,
    datasetName,
    indexes,
    labelSchemas,
    promptableIndexes,
    savedViews,
    staticTransforms,
  });
  return build_.samples.map(({ id, filepath }) => ({ id, filepath }));
};

/**
 * Generated PNG samples at `<tmpdir>/<datasetName>/<index>.png`, with an
 * `index` field on every sample.
 *
 * @throws {Error} If `numSamples` is less than 1 or not an integer.
 */
const createImageDataset = async (options: ImageDatasetOptions) => {
  const {
    datasetName,
    imageOptions,
    numSamples = 1,
    numbered = false,
    schema = {},
    withSampleData = () => ({}),
  } = options;
  const helpers = makeHelpers();
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

  return buildWith(options, {
    mediaType: "image",
    samples: media.map(({ _id, filepath, index }) => ({
      id: _id,
      filepath,
      data: { index, ...withSampleData({ _id, filepath, index }, helpers) },
    })),
    schema: { index: "IntField", ...schema },
  });
};

const DEFAULT_GROUP_SLICES: GroupSliceConfig[] = [
  { name: "left", mediaType: "image" },
  { name: "right", mediaType: "image" },
  { name: "3d", mediaType: "3d" },
];

/**
 * Group dataset: image slices are generated PNGs, 3D slices a PLY mesh wrapped
 * in a `.fo3d` scene (or a bare asset), point-cloud slices a bare `.pcd`,
 * video slices generated clips. The default layout is `left` (image), `right`
 * (image) and `3d`, and the first slice is the default one. Group
 * `groupIndex` has id `indexToId(groupIndex)` and a sample in every slice
 * whose `groupIndices` include it. Slice-level media options take the group
 * index.
 *
 * @example
 * await DatasetFactory.createDataset({
 *   mediaType: "group",
 *   datasetName: "my-groups",
 *   numGroups: 4,
 *   slices: [
 *     { name: "left", mediaType: "image" },
 *     { name: "pcd", mediaType: "3d", groupIndices: [0, 2] },
 *   ],
 * });
 */
const createGroupDataset = async (options: GroupDatasetOptions) => {
  const {
    datasetName,
    imageOptions = {
      fillColor: "#22577a",
      width: 128,
      height: 128,
      hideLogs: true,
    },
    numGroups = 3,
    pcdOptions,
    sampleFrames = false,
    sceneOptions = { meshes: [{ color: [96, 208, 255] }] },
    schema,
    slices = DEFAULT_GROUP_SLICES,
    videoOptions,
    withFrameData,
    withSampleData = () => ({}),
  } = options;
  const helpers = makeHelpers();
  const entries = Array.from({ length: numGroups }, (_, groupIndex) =>
    slices
      .filter(
        ({ groupIndices }) =>
          !groupIndices || groupIndices.includes(groupIndex),
      )
      .map((slice) => ({ groupIndex, slice })),
  ).flat();

  const media = await generateMedia(
    datasetName,
    entries.map(({ slice, groupIndex }) => `${slice.name}-${groupIndex}`),
    (index) => {
      const { groupIndex, slice } = entries[index];
      switch (slice.mediaType) {
        case "image":
          return imageMedia({
            ...resolve(imageOptions, index),
            ...resolve(slice.imageOptions, groupIndex),
          });
        case "video":
          return videoMedia({
            ...resolve(videoOptions, index),
            ...resolve(slice.videoOptions, groupIndex),
          });
        case "point-cloud":
          return pcdMedia({
            ...resolve(pcdOptions, index),
            ...resolve(slice.pcdOptions, groupIndex),
          });
        default:
          return sceneMedia(
            resolve(slice.sceneOptions, groupIndex) ??
              resolve(sceneOptions, index),
          );
      }
    },
  );

  return buildWith(options, {
    mediaType: "group",
    groupSlices: slices,
    samples: media.map(({ _id, filepath, index, numFrames }): SampleSpec => {
      const { groupIndex, slice } = entries[index];
      return {
        id: _id,
        filepath,
        group: { id: indexToId(groupIndex), name: slice.name },
        ...(slice.mediaType === "3d" ? { mediaType: "3d" } : {}),
        data: withSampleData(
          { _id, filepath, index, groupIndex, slice: slice.name, numFrames },
          helpers,
        ),
      };
    }),
    frames: media.flatMap(({ _id, index, numFrames }) =>
      numFrames === undefined
        ? []
        : frameSpecs(_id, index, numFrames, withFrameData, helpers),
    ),
    sampleFrames,
    schema,
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
const createVideoDataset = async (options: VideoDatasetOptions) => {
  const {
    datasetName,
    numSamples = 1,
    sampleFrames = false,
    schema,
    videoOptions,
    withFrameData,
    withSampleData = () => ({}),
  } = options;
  const helpers = makeHelpers();
  const media = await generateMedia(datasetName, indices(numSamples), (index) =>
    videoMedia({ ...resolve(videoOptions, index) }),
  );

  return buildWith(options, {
    mediaType: "video",
    samples: media.map(({ _id, filepath, index, numFrames }) => ({
      id: _id,
      filepath,
      data: withSampleData({ _id, filepath, index, numFrames }, helpers),
    })),
    frames: media.flatMap(({ _id, index, numFrames }) =>
      frameSpecs(_id, index, numFrames, withFrameData, helpers),
    ),
    sampleFrames,
    schema,
  });
};

/**
 * 3D dataset with one generated `.fo3d` scene (a PLY cube) per sample at
 * `<tmpdir>/<datasetName>/<index>.fo3d`, or the bare `.pcd`/`.ply` asset a
 * sample's `sceneOptions` names.
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
const create3dDataset = async (options: Dataset3dOptions) => {
  const {
    datasetName,
    numSamples = 1,
    orthographicProjections,
    sceneOptions,
    schema,
    withSampleData = () => ({}),
  } = options;
  const helpers = makeHelpers();
  const media = await generateMedia(datasetName, indices(numSamples), (index) =>
    sceneMedia(resolve(sceneOptions, index)),
  );

  return buildWith(options, {
    mediaType: "3d",
    samples: media.map(({ _id, filepath, index }) => ({
      id: _id,
      filepath,
      mediaType: "3d",
      data: withSampleData({ _id, filepath, index }, helpers),
    })),
    orthographicProjections,
    schema,
  });
};

/**
 * Point cloud dataset with one generated `.pcd` per sample at
 * `<tmpdir>/<datasetName>/<index>.pcd`.
 *
 * @example
 * await DatasetFactory.createDataset({
 *   mediaType: "point-cloud",
 *   datasetName: "my-clouds",
 *   pcdOptions: { shape: "diagonal", numPoints: 12 },
 *   orthographicProjections: { size: [-1, 64] },
 * });
 */
const createPointCloudDataset = async (options: PointCloudDatasetOptions) => {
  const {
    datasetName,
    numSamples = 1,
    orthographicProjections,
    pcdOptions,
    schema,
    withSampleData = () => ({}),
  } = options;
  const helpers = makeHelpers();
  const media = await generateMedia(datasetName, indices(numSamples), (index) =>
    pcdMedia({ ...resolve(pcdOptions, index) }),
  );

  return buildWith(options, {
    mediaType: "point-cloud",
    samples: media.map(({ _id, filepath, index }) => ({
      id: _id,
      filepath,
      data: withSampleData({ _id, filepath, index }, helpers),
    })),
    orthographicProjections,
    schema,
  });
};

/**
 * Multimodal dataset with one generated MCAP recording per sample at
 * `<tmpdir>/<datasetName>/<fileName>.mcap`.
 *
 * @example
 * await DatasetFactory.createDataset({ mediaType: "multimodal", datasetName: "my-episodes" });
 */
const createMultimodalDataset = async (options: MultimodalDatasetOptions) => {
  const {
    datasetName,
    fileNames,
    mcapOptions,
    numSamples = 1,
    schema,
    withSampleData = () => ({}),
  } = options;
  const helpers = makeHelpers();
  const media = await generateMedia(
    datasetName,
    indices(numSamples).map((name, index) => resolve(fileNames, index) ?? name),
    (index) =>
      mcapMedia({ kind: "tiny-episode-a", ...resolve(mcapOptions, index) }),
  );

  return buildWith(options, {
    mediaType: "multimodal",
    samples: media.map(({ _id, filepath, index }) => ({
      id: _id,
      filepath,
      data: withSampleData({ _id, filepath, index }, helpers),
    })),
    schema,
  });
};
