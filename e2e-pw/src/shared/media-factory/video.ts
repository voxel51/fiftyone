/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { Duration } from "src/oss/utils";

/**
 * Options for generating a solid-color video via ffmpeg.
 */
export interface VideoOptions {
  /** Duration of the video in seconds. */
  duration: number;
  /** Width of the video in pixels. */
  width: number;
  /** Height of the video in pixels. */
  height: number;
  /** Frame rate of the video in frames per second. */
  frameRate: number;
  /** Background color of the video as a CSS hex string (e.g. `"#ff0000"`). */
  color: string;
  /** When `true`, muxes in a sine-tone audio track. */
  audio: boolean;
  /** Container and codec: `webm` (VP8) or `mp4` (VP9, faststart). */
  container: "webm" | "mp4";
}

export const DEFAULT_VIDEO_OPTIONS: VideoOptions = {
  duration: 2,
  width: 64,
  height: 64,
  frameRate: 10,
  color: "#3050a0",
  audio: false,
  container: "webm",
};

const CONTAINERS = new Set(["webm", "mp4"]);

/**
 * Generates a solid-color video file using ffmpeg, optionally carrying a
 * sine-tone audio track, and returns the path written.
 *
 * `outputPath` may name the container by extension (`clip.webm`) or omit it,
 * in which case `container` picks the extension. The video codec follows the
 * container (VP8/`.webm`, VP9/`.mp4`) at a target bitrate of 1Mbps and
 * `yuv420p` pixel format; audio, when requested, is Opus. The ffmpeg process
 * is run synchronously via a shell subprocess with a 10-second timeout.
 *
 * A clip that already exists at the resolved path is reused: dataset media
 * paths are unique per run, so a repeat call is a re-seed of the same clip.
 *
 * @example
 * await createVideo({
 *   outputPath: "/tmp/videos/clip",
 *   duration: 3,
 *   width: 640,
 *   height: 480,
 *   frameRate: 30,
 *   color: "#00ff00",
 *   container: "webm",
 * });
 */
export const createVideo = async ({
  outputPath,
  ...options
}: Partial<VideoOptions> & { outputPath: string }): Promise<string> => {
  const extension = path.extname(outputPath).slice(1);
  const { duration, width, height, frameRate, color, audio, container } = {
    ...DEFAULT_VIDEO_OPTIONS,
    ...(CONTAINERS.has(extension) ? { container: extension } : {}),
    ...options,
  } as VideoOptions;
  const resolvedPath = outputPath.endsWith(`.${container}`)
    ? outputPath
    : `${outputPath}.${container}`;

  if (fs.existsSync(resolvedPath)) {
    return resolvedPath;
  }

  const startTime = performance.now();

  const isMp4 = container === "mp4";
  const inputs = [
    `-f lavfi -i 'color=c=${color}:s=${width}x${height}'`,
    // Opus requires 48 kHz
    audio ? `-f lavfi -i 'sine=frequency=440:sample_rate=48000'` : "",
  ];
  const args = [
    `-t ${duration}`,
    `-r ${String(frameRate)}`,
    `-c:v ${isMp4 ? "libvpx-vp9" : "libvpx"}`,
    "-b:v 1M",
    "-pix_fmt yuv420p",
    audio ? "-c:a libopus -b:a 64k" : "",
    isMp4 ? "-movflags +faststart" : "",
  ];
  const ffmpegCommand = ["ffmpeg", ...inputs, ...args, resolvedPath]
    .filter(Boolean)
    .join(" ");

  spawnSync(ffmpegCommand, {
    shell: true,
    timeout: Duration.Seconds(10),
  });

  const endTime = performance.now();
  const timeTaken = endTime - startTime;
  console.log(
    `Video generation, path = ${resolvedPath}, completed in ${timeTaken} milliseconds`,
  );

  return resolvedPath;
};
