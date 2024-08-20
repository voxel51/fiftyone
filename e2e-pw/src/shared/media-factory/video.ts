import { spawnSync } from "child_process";
import { Duration } from "src/oss/utils";
interface CreateBlankVideoOptions {
  /**
   * Duration of the video in seconds
   */
  duration: number;
  /**
   * Width of the video in pixels
   */
  width: number;
  /**
   * Height of the video in pixels
   */
  height: number;
  /**
   * Frame rate of the video in frames per second
   */
  frameRate: number;
  /**
   * Color of the video in hex format
   */
  color: string;
  /**
   * Path to the output video.
   * Make sure the extension of the video matches the codec used (webm)
   */
  outputPath: string;
}

export const createBlankVideo = async (
  options: CreateBlankVideoOptions
): Promise<void> => {
  const { duration, width, height, frameRate, color, outputPath } = options;
  const startTime = performance.now();

  const ffmpegCommand = `ffmpeg -filter_complex 'color=c=${color}:s=${width}x${height}' -t ${duration} -r ${String(
    frameRate
  )} -c:v libvpx -b:v 1M -pix_fmt yuv420p ${outputPath}`;

  spawnSync(ffmpegCommand, {
    shell: true,
    timeout: Duration.Seconds(5),
  });

  const endTime = performance.now();
  const timeTaken = endTime - startTime;
  console.log(
    `Video generation, path = ${outputPath}, completed in ${timeTaken} milliseconds`
  );
};
