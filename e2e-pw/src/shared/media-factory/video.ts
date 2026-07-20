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
   * When `true`, muxes in a 440 Hz sine-tone audio track (Opus) spanning
   * the full duration. Omit for a video with no audio track at all.
   */
  audio?: boolean;
  /**
   * Path to the output video file. The extension picks the container and
   * video codec: `.webm` encodes VP8 (`libvpx`), `.mp4` encodes VP9
   * (`libvpx-vp9`, faststart) — an ISO-BMFF container the app's WebCodecs
   * pipeline can demux, using only royalty-free codecs so Playwright's
   * Chromium can decode it.
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
  const { duration, width, height, frameRate, color, audio, outputPath } =
    options;
  const startTime = performance.now();

  const isMp4 = outputPath.endsWith(".mp4");
  const inputs = [
    `-f lavfi -i 'color=c=${color}:s=${width}x${height}'`,
    // Opus requires a 48 kHz input.
    audio ? `-f lavfi -i 'sine=frequency=440:sample_rate=48000'` : "",
  ];
  const args = [
    `-t ${duration}`,
    `-r ${String(frameRate)}`,
    `-c:v ${isMp4 ? "libvpx-vp9" : "libvpx"}`,
    "-b:v 1M",
    "-pix_fmt yuv420p",
    audio ? "-c:a libopus -b:a 64k" : "",
    // faststart puts the moov up front so header-only demux reads stay cheap.
    isMp4 ? "-movflags +faststart" : "",
  ];
  const ffmpegCommand = ["ffmpeg", ...inputs, ...args, outputPath]
    .filter(Boolean)
    .join(" ");

  spawnSync(ffmpegCommand, {
    shell: true,
    timeout: Duration.Seconds(10),
  });

  const endTime = performance.now();
  const timeTaken = endTime - startTime;
  console.log(
    `Video generation, path = ${outputPath}, completed in ${timeTaken} milliseconds`,
  );
};
