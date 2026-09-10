/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { createImage } from "./image";
import { createFo3d } from "./fo3d";
import { createMcapFixture } from "./mcap";
import { createPcd } from "./pcd";
import { createPly } from "./ply";
import { createScene } from "./scene";
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
export const MediaFactory = {
  /** Creates a deterministic indexed MCAP recording. See {@link createMcapFixture}. */
  createMcapFixture,
  /** Creates a solid-color video (VP8/`.webm` or VP9/`.mp4`), optionally with a sine audio track. See {@link createVideo}. */
  createVideo,
  /** Creates a PNG image with an optional fill color and watermark. See {@link createImage}. */
  createImage,
  /** Creates a PCD point cloud file with points arranged in a diagonal or cubic grid. See {@link createPcd}. */
  createPcd,
  createPly,
  /** Writes a minimal fo3d scene JSON file wrapping a single PLY mesh. See {@link createFo3d}. */
  createFo3d,
  /** Writes a PLY cube plus the fo3d scene wrapping it. See {@link createScene}. */
  createScene,
};
