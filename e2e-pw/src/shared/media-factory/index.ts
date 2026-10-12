/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { createImage } from "./image";
import { createMask, createMaskImage } from "./mask";
import { createFo3d } from "./fo3d";
import { createMcapFixture } from "./mcap";
import { createPcd } from "./pcd";
import { createPly } from "./ply";
import { createScene } from "./scene";
import { createStl } from "./stl";
import { createVideo } from "./video";

/**
 * Factory for generating media files of various types.
 *
 * Provides a unified entry point for creating images, videos, and point clouds
 * used in dataset fixtures and test scaffolding.
 *
 * @example
 * import { MediaFactory } from "./media-factory";
 *
 * await MediaFactory.createImage({ outputPath: "/tmp/sample.png", width: 128, height: 128 });
 * await MediaFactory.createVideo({ outputPath: "/tmp/clip", duration: 3, container: "webm" });
 * MediaFactory.createScene({ outputPath: "/tmp/scene" });
 * MediaFactory.createPcd({ outputPath: "/tmp/scene.pcd", numPoints: 10, shape: "diagonal" });
 */
export type {
  Fo3dOptions,
  SceneCamera,
  SceneMaterial,
  SceneNode,
  SceneNodeSpec,
} from "./fo3d";
export type { ImageOptions, ImageSpec } from "./image";
export type { McapOptions, McapSpec } from "./mcap";
export type { PcdOptions, PcdSpec } from "./pcd";
export type { PlyOptions, PlySpec } from "./ply";
export type { SceneOptions, SceneSpec } from "./scene";
export type { StlOptions, StlSpec } from "./stl";
export type { MediaOptions } from "./types";
export type { VideoOptions, VideoSpec } from "./video";

export const MediaFactory = {
  /** Creates a deterministic indexed MCAP recording. See {@link createMcapFixture}. */
  createMcapFixture,
  /** Creates a solid-color video (VP8/`.webm` or VP9/`.mp4`), optionally with a sine audio track. See {@link createVideo}. */
  createVideo,
  /** Creates a PNG image with an optional fill color and watermark. See {@link createImage}. */
  createImage,
  /** Creates an all-ones numpy mask in FiftyOne's stored form, for a Detection `mask`. See {@link createMask}. */
  createMask,
  /** Writes an 8-bit grayscale PNG of one value, for a label's `mask_path`. See {@link createMaskImage}. */
  createMaskImage,
  /** Creates a PCD point cloud file with points arranged in a diagonal or cubic grid. See {@link createPcd}. */
  createPcd,
  createPly,
  /** Writes a minimal fo3d scene JSON file wrapping a single PLY mesh. See {@link createFo3d}. */
  createFo3d,
  /** Writes PLY/PCD/STL assets plus the fo3d scene placing them. See {@link createScene}. */
  createScene,
  /** Writes an ASCII STL cube. See {@link createStl}. */
  createStl,
};
