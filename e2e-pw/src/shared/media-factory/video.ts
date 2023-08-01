import ffmpeg from "fluent-ffmpeg";

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
  return new Promise((resolve, reject) => {
    const startTime = performance.now();

    ffmpeg()
      .input(`color=c=${color}:s=${width}x${height}`)
      .inputOptions(["-f", "lavfi", "-t", String(duration)])
      .outputOptions([
        "-r",
        String(frameRate),
        "-c:v",
        // use libvpx for webm, (libx264 for h264 WHICH IS NOT SUPPORTED IN CHROMIUM)
        "libvpx",
        // bitrate is 1M per second
        "-b:v",
        "1M",
        "-pix_fmt",
        "yuv420p",
      ])
      .output(outputPath)
      .on("start", () => {
        console.log(
          `Creating blank video with options: ${JSON.stringify(options)}`
        );
      })
      .on("end", () => {
        const endTime = performance.now();
        const timeTaken = endTime - startTime;
        console.log(
          `Video generation, path = ${outputPath}, completed in ${timeTaken} milliseconds`
        );
        resolve();
      })
      .on("error", (error) => {
        console.log(
          `An error occurred while creating the video, path = ${outputPath}, error = ${error}`
        );
        reject(error);
      })
      .run();
  });
};
