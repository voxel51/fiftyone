/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { createBlankImage } from "./image";
import { createPcd } from "./pcd";
import { createPly } from "./ply";
import { createBlankVideo } from "./video";

/**
 * Factory for generating blank media files of various types.
 *
 * Provides a unified entry point for creating images, videos, and point clouds
 * used in dataset fixtures and test scaffolding.
 *
 * @example
 * import { MediaFactory } from "./media-factory";
 *
 * await MediaFactory.createBlankImage({ outputPath: "/tmp/sample.png", width: 128, height: 128 });
 * await MediaFactory.createBlankVideo({ outputPath: "/tmp/clip.webm", duration: 3, width: 640, height: 480, frameRate: 30, color: "#ffffff" });
 * MediaFactory.createPcd({ outputPath: "/tmp/scene.pcd", numPoints: 10, shape: "diagonal" });
 */
export const MediaFactory = {
  /** Creates a blank solid-color WebM video encoded with the libvpx VP8 codec. See {@link createBlankVideo}. */
  createBlankVideo,
  /** Creates a blank PNG image with an optional fill color and watermark. See {@link createBlankImage}. */
  createBlankImage,
  /** Creates a PCD point cloud file with points arranged in a diagonal or cubic grid. See {@link createPcd}. */
  createPcd,
  createPly,
};
