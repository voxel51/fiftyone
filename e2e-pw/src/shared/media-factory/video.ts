/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { spawnSync } from "child_process";
import path from "path";
import { Duration } from "src/oss/utils";
import type { MediaOptions } from "./types";
import { generateOnce } from "./write";

/**
 * What to record in a solid-color video via ffmpeg; every field has a default.
 */
export interface VideoSpec {
  /** Duration of the video in seconds. */
  duration?: number;
  /** Width of the video in pixels. */
  width?: number;
  /** Height of the video in pixels. */
  height?: number;
  /** Frame rate of the video in frames per second. */
  frameRate?: number;
  /** Background color of the video as a CSS hex string (e.g. `"#ff0000"`). */
  color?: string;
  /** When `true`, muxes in a sine-tone audio track. */
  audio?: boolean;
  /** Container and codec: `webm` (VP8) or `mp4` (VP9, faststart). */
  container?: "webm" | "mp4";
}

export type VideoOptions = MediaOptions & VideoSpec;

export const DEFAULT_VIDEO_SPEC: Required<VideoSpec> = {
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
 * Generates a solid-color video via ffmpeg (VP8/`.webm` or VP9/`.mp4`, 1Mbps
 * `yuv420p`, optional Opus sine tone) and returns the path written;
 * `outputPath` may name the container by extension or omit it. An existing
 * clip at the resolved path is reused.
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
export const createVideo = async (options: VideoOptions): Promise<string> => {
  const extension = path.extname(options.outputPath).slice(1);
  const {
    outputPath,
    duration,
    width,
    height,
    frameRate,
    color,
    audio,
    container,
  } = {
    ...DEFAULT_VIDEO_SPEC,
    ...(CONTAINERS.has(extension)
      ? { container: extension as VideoSpec["container"] }
      : {}),
    ...options,
  };
  const resolvedPath = outputPath.endsWith(`.${container}`)
    ? outputPath
    : `${outputPath}.${container}`;

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

  await generateOnce("Video", { ...options, outputPath: resolvedPath }, () => {
    spawnSync(ffmpegCommand, {
      shell: true,
      timeout: Duration.Seconds(10),
    });
  });

  return resolvedPath;
};
