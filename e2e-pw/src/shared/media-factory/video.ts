/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { spawnSync } from "child_process";
import path from "path";
import { Duration } from "src/oss/utils";
import { rewriteSyncTable } from "./mp4SyncTable";
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
  /**
   * Background color as a CSS hex string (e.g. `"#ff0000"`), or several: the
   * clip is then split into equal-duration solid segments of those colors.
   */
  color?: string | string[];
  /** When `true`, muxes in a sine-tone audio track. */
  audio?: boolean;
  /** Container and codec: `webm` (VP8) or `mp4` (VP9, faststart). */
  container?: "webm" | "mp4";
  /** Keyframe interval in frames (ffmpeg `-g`); the encoder default when omitted. */
  keyframeInterval?: number;
  /**
   * Rewrite the mp4 sync-sample table (`stss`) to these 1-indexed sample
   * numbers, entry for entry, after encoding. Models a container whose
   * keyframe flags disagree with the bitstream. Must match the table's
   * existing length; `mp4` only.
   */
  syncSamples?: number[];
}

export type VideoOptions = MediaOptions & VideoSpec;

export const DEFAULT_VIDEO_SPEC: Required<
  Omit<VideoSpec, "keyframeInterval" | "syncSamples">
> = {
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
    keyframeInterval,
    syncSamples,
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
  if (syncSamples && !isMp4) {
    throw new Error("syncSamples requires an mp4 container");
  }

  const colors = Array.isArray(color) ? color : [color];
  if (colors.length === 0) {
    throw new Error("color must contain at least one value");
  }

  const segment = duration / colors.length;
  const inputs = [
    ...colors.map(
      (c) => `-f lavfi -i 'color=c=${c}:s=${width}x${height}:d=${segment}'`,
    ),
    // Opus requires 48 kHz
    audio ? `-f lavfi -i 'sine=frequency=440:sample_rate=48000'` : "",
  ];
  // Several colors concatenate into one stream; audio then needs an explicit map.
  const concat =
    colors.length > 1
      ? [
          `-filter_complex '${colors.map((_, i) => `[${i}:v]`).join("")}` +
            `concat=n=${colors.length}:v=1:a=0[v]'`,
          "-map '[v]'",
          audio ? `-map ${colors.length}:a` : "",
        ]
      : [];
  const args = [
    ...concat,
    `-t ${duration}`,
    `-r ${String(frameRate)}`,
    `-c:v ${isMp4 ? "libvpx-vp9" : "libvpx"}`,
    "-b:v 1M",
    "-pix_fmt yuv420p",
    keyframeInterval ? `-g ${keyframeInterval}` : "",
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
    if (syncSamples) {
      rewriteSyncTable(resolvedPath, syncSamples);
    }
  });

  return resolvedPath;
};
