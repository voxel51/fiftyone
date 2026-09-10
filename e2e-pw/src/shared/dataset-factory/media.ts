/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import os from "os";
import path from "path";
import { createImage, type ImageSpec } from "../media-factory/image";
import { createMask } from "../media-factory/mask";
import { createMcapFixture, type McapSpec } from "../media-factory/mcap";
import {
  createPcd,
  DEFAULT_PCD_SPEC,
  type PcdSpec,
} from "../media-factory/pcd";
import { createScene, type SceneSpec } from "../media-factory/scene";
import {
  createVideo,
  DEFAULT_VIDEO_SPEC,
  type VideoSpec,
} from "../media-factory/video";
import { createId, ensureDirExists, indexToId } from "../utils";
import type {
  FrameScaffold,
  FrameSpec,
  Helpers,
  JSONObject,
  PerSample,
} from "./types";

export const helpers: Helpers = { createId, mask: createMask };

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

export const sceneMedia =
  (spec: SceneSpec): MediaGenerator<GeneratedMedia> =>
  (outputPath) => ({ filepath: createScene({ outputPath, ...spec }) });

export const mcapMedia =
  (spec: McapSpec): MediaGenerator<GeneratedMedia> =>
  async (outputPath) => {
    const filepath = `${outputPath}.mcap`;
    await createMcapFixture({ outputPath: filepath, ...spec });
    return { filepath };
  };

export const indices = (count: number) =>
  Array.from({ length: count }, (_, index) => String(index));

/**
 * Generates every sample's media under `<tmpdir>/<datasetName>/<name>` and
 * returns each file with the sample's fixed id and index.
 */
export const generateMedia = async <M extends GeneratedMedia>(
  datasetName: string,
  names: string[],
  media: (index: number) => MediaGenerator<M>,
) => {
  const outputDir = path.join(os.tmpdir(), datasetName);
  await ensureDirExists(outputDir);
  return Promise.all(
    names.map(async (name, index) => ({
      _id: indexToId(index),
      index,
      ...(await media(index)(path.join(outputDir, name))),
    })),
  );
};

/** The frame documents of one clip, one per frame number, from `withFrameData`. */
export const frameSpecs = (
  sampleId: string,
  sampleIndex: number,
  numFrames: number,
  withFrameData?: (frame: FrameScaffold, helpers: Helpers) => JSONObject,
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
