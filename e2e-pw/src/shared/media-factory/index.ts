/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { createImage } from "./image";
import { createFo3d } from "./fo3d";
import { createPcd } from "./pcd";
import { createPly } from "./ply";
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
 * await MediaFactory.createVideo({ outputPath: "/tmp/clip.webm", duration: 3, width: 640, height: 480, frameRate: 30, color: "#ffffff" });
 * MediaFactory.createPcd({ outputPath: "/tmp/scene.pcd", numPoints: 10, shape: "diagonal" });
 */
export const MediaFactory = {
  /** Creates a solid-color WebM video encoded with the libvpx VP8 codec. See {@link createVideo}. */
  createVideo,
  /** Creates a PNG image with an optional fill color and watermark. See {@link createImage}. */
  createImage,
  /** Creates a PCD point cloud file with points arranged in a diagonal or cubic grid. See {@link createPcd}. */
  createPcd,
  createPly,
  /** Writes a minimal fo3d scene JSON file wrapping a single PLY mesh. See {@link createFo3d}. */
  createFo3d,
};
