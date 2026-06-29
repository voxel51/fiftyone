/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { spawnSync } from "child_process";
import { Duration } from "src/oss/utils";

/**
 * Options for generating a video file via ffmpeg.
 */
interface CreateVideoOptions {
  /**
   * Duration of the video in seconds.
   */
  duration: number;
  /**
   * Width of the video in pixels.
   */
  width: number;
  /**
   * Height of the video in pixels.
   */
  height: number;
  /**
   * Frame rate of the video in frames per second.
   */
  frameRate: number;
  /**
   * Background color of the video as a CSS hex string (e.g. `"#ff0000"`).
   */
  color: string;
  /**
   * Path to the output video file.
   * The file extension must match the codec used — this function encodes
   * with `libvpx`, so the output path should use a `.webm` extension
   * (e.g. `/tmp/videos/clip.webm`).
   */
  outputPath: string;
}

/**
 * Generates a solid-color video file using ffmpeg.
 *
 * The video is encoded with the `libvpx` VP8 codec at a target bitrate of 1Mbps
 * and `yuv420p` pixel format. The ffmpeg process is run synchronously via a
 * shell subprocess with a 5-second timeout. Performance timing is always logged
 * to the console on completion.
 *
 * @param options - Configuration for video generation. See {@link CreateVideoOptions}.
 * @returns A `Promise` that resolves when the video has been written to disk.
 *
 * @example
 * await createVideo({
 *   outputPath: "/tmp/videos/clip.webm",
 *   duration: 3,
 *   width: 640,
 *   height: 480,
 *   frameRate: 30,
 *   color: "#00ff00",
 * });
 */
export const createVideo = async (
  options: CreateVideoOptions,
): Promise<void> => {
  const { duration, width, height, frameRate, color, outputPath } = options;
  const startTime = performance.now();

  const ffmpegCommand = `ffmpeg -filter_complex 'color=c=${color}:s=${width}x${height}' -t ${duration} -r ${String(
    frameRate,
  )} -c:v libvpx -b:v 1M -pix_fmt yuv420p ${outputPath}`;

  spawnSync(ffmpegCommand, {
    shell: true,
    timeout: Duration.Seconds(5),
  });

  const endTime = performance.now();
  const timeTaken = endTime - startTime;
  console.log(
    `Video generation, path = ${outputPath}, completed in ${timeTaken} milliseconds`,
  );
};
