/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import os from "os";
import path from "path";
import { createImage, type ImageSpec } from "../media-factory/image";
import {
  createMask,
  createTargetMask,
  createValueMap,
} from "../media-factory/mask";
import { createMcapFixture, type McapSpec } from "../media-factory/mcap";
import {
  createPcd,
  DEFAULT_PCD_SPEC,
  type PcdSpec,
} from "../media-factory/pcd";
import { createPly } from "../media-factory/ply";
import { createScene } from "../media-factory/scene";
import {
  createVideo,
  DEFAULT_VIDEO_SPEC,
  type VideoSpec,
} from "../media-factory/video";
import { createId, ensureDirExists, indexToId } from "../utils";
import { makeLabelBuilders } from "./labels";
import type {
  FrameScaffold,
  FrameSpec,
  Helpers,
  JSONObject,
  PerSample,
  ThreeDSpec,
} from "./types";

/** The helpers for one dataset build; instance identities do not leak across builds. */
export const makeHelpers = (): Helpers => ({
  createId,
  mask: createMask,
  targetMask: createTargetMask,
  valueMap: createValueMap,
  label: makeLabelBuilders(),
});

export const resolve = <T>(
  options: PerSample<T> | undefined,
  index: number,
): T | undefined =>
  typeof options === "function"
    ? (options as (index: number) => T)(index)
    : options;

/** A generated media file, plus the frame count when it is a clip. */
interface GeneratedMedia {
  filepath: string;
  numFrames?: number;
}

/** Writes one sample's media at `outputPath` (extension-less). */
type MediaGenerator<M extends GeneratedMedia> = (
  outputPath: string,
) => M | Promise<M>;

export const imageMedia =
  (spec: ImageSpec): MediaGenerator<GeneratedMedia> =>
  async (outputPath) => {
    const filepath = `${outputPath}.png`;
    await createImage({ outputPath: filepath, ...spec });
    return { filepath };
  };

export const videoMedia =
  (spec: VideoSpec): MediaGenerator<Required<GeneratedMedia>> =>
  async (outputPath) => {
    const { duration, frameRate } = { ...DEFAULT_VIDEO_SPEC, ...spec };
    return {
      filepath: await createVideo({ outputPath, ...spec }),
      numFrames: Math.round(duration * frameRate),
    };
  };

export const pcdMedia =
  (spec: Partial<PcdSpec>): MediaGenerator<GeneratedMedia> =>
  (outputPath) => {
    const filepath = `${outputPath}.pcd`;
    createPcd({ outputPath: filepath, ...DEFAULT_PCD_SPEC, ...spec });
    return { filepath };
  };

/** A `.fo3d` scene, or the bare PCD or PLY asset the spec names. */
export const sceneMedia =
  (spec: ThreeDSpec = {}): MediaGenerator<GeneratedMedia> =>
  (outputPath) => {
    if ("pcd" in spec) {
      return pcdMedia(spec.pcd)(outputPath);
    }
    if ("ply" in spec) {
      const filepath = `${outputPath}.ply`;
      createPly({ outputPath: filepath, ...spec.ply });
      return { filepath };
    }
    return { filepath: createScene({ outputPath, ...spec }) };
  };

export const mcapMedia =
  (spec: McapSpec): MediaGenerator<GeneratedMedia> =>
  async (outputPath) => {
    const filepath = `${outputPath}.mcap`;
    await createMcapFixture({ outputPath: filepath, ...spec });
    return { filepath };
  };

export const indices = (count: number) =>
  Array.from({ length: count }, (_, index) => String(index));

/** The directory a dataset's generated media lives in. */
export const mediaDir = (datasetName: string) =>
  path.join(os.tmpdir(), datasetName);

/**
 * Generates every sample's media under `<tmpdir>/<datasetName>/<name>` and
 * returns each file with the sample's fixed id and index. Samples sharing a
 * name share the first one's file.
 */
export const generateMedia = async <M extends GeneratedMedia>(
  datasetName: string,
  names: string[],
  media: (index: number) => MediaGenerator<M>,
) => {
  const outputDir = mediaDir(datasetName);
  await ensureDirExists(outputDir);
  const generated = new Map<string, Promise<M>>();
  return Promise.all(
    names.map(async (name, index) => {
      if (!generated.has(name)) {
        generated.set(
          name,
          Promise.resolve(media(index)(path.join(outputDir, name))),
        );
      }
      return { _id: indexToId(index), index, ...(await generated.get(name)) };
    }),
  );
};

/**
 * Generates the `mediaFields` images of `count` samples at
 * `<tmpdir>/<datasetName>/<field>-<index>.png` and returns each sample's
 * field values.
 */
export const mediaFieldValues = async (
  datasetName: string,
  count: number,
  mediaFields: { [field: string]: PerSample<ImageSpec> } = {},
): Promise<JSONObject[]> => {
  const values: JSONObject[] = Array.from({ length: count }, () => ({}));
  await Promise.all(
    Object.entries(mediaFields).flatMap(([field, spec]) =>
      values.map(async (sampleValues, index) => {
        const filepath = path.join(
          mediaDir(datasetName),
          `${field}-${index}.png`,
        );
        await createImage({
          outputPath: filepath,
          hideLogs: true,
          ...resolve(spec, index),
        });
        sampleValues[field] = filepath;
      }),
    ),
  );
  return values;
};

/** The frame documents of one clip, one per frame number, from `withFrameData`. */
export const frameSpecs = (
  sampleId: string,
  sampleIndex: number,
  numFrames: number,
  withFrameData:
    | ((frame: FrameScaffold, helpers: Helpers) => JSONObject)
    | undefined,
  helpers: Helpers,
): FrameSpec[] =>
  withFrameData
    ? Array.from({ length: numFrames }, (_, i) => {
        const frameNumber = i + 1;
        return {
          sampleId,
          frameNumber,
          data: withFrameData(
            { sampleId, sampleIndex, frameNumber, numFrames },
            helpers,
          ),
        };
      })
    : [];
