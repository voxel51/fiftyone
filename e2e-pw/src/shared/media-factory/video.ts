/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { spawnSync } from "child_process";
import { Duration } from "src/oss/utils";
import { rewriteSyncTable } from "./mp4SyncTable";

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
   * Background color as a CSS hex string (e.g. `"#ff0000"`), or several: the
   * clip is then split into equal-duration solid segments of those colors.
   */
  color: string | string[];
  /** When `true`, muxes in a sine-tone audio track. */
  audio?: boolean;
  /** Keyframe interval in frames (ffmpeg `-g`); the encoder default when omitted. */
  keyframeInterval?: number;
  /**
   * Rewrite the mp4 sync-sample table (`stss`) to these 1-indexed sample
   * numbers, entry for entry, after encoding. Models a container whose
   * keyframe flags disagree with the bitstream. Must match the table's
   * existing length; `.mp4` only.
   */
  syncSamples?: number[];
  /**
   * Path to the output video file. The extension picks the container and
   * codec: `.webm` (VP8) or `.mp4` (VP9, faststart).
   */
  outputPath: string;
}

/**
 * Generates a solid-color video file using ffmpeg, optionally carrying a
 * sine-tone audio track.
 *
 * The video codec follows the output extension (VP8/`.webm`, VP9/`.mp4`) at
 * a target bitrate of 1Mbps and `yuv420p` pixel format; audio, when
 * requested, is Opus. The ffmpeg process is run synchronously via a shell
 * subprocess with a 10-second timeout. Performance timing is always logged
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
  const {
    duration,
    width,
    height,
    frameRate,
    color,
    audio,
    keyframeInterval,
    syncSamples,
    outputPath,
  } = options;
  const startTime = performance.now();

  const isMp4 = outputPath.endsWith(".mp4");
  if (syncSamples && !isMp4) {
    throw new Error("syncSamples requires an .mp4 output");
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
  const ffmpegCommand = ["ffmpeg", ...inputs, ...args, outputPath]
    .filter(Boolean)
    .join(" ");

  spawnSync(ffmpegCommand, {
    shell: true,
    timeout: Duration.Seconds(10),
  });

  if (syncSamples) {
    rewriteSyncTable(outputPath, syncSamples);
  }

  const endTime = performance.now();
  const timeTaken = endTime - startTime;
  console.log(
    `Video generation, path = ${outputPath}, completed in ${timeTaken} milliseconds`,
  );
};
