import ffmpeg from "fluent-ffmpeg";

export const createBlankVideo = async (options: {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  outputPath: string;
}): Promise<void> => {
  const { duration, width, height, frameRate, outputPath } = options;
  return new Promise((resolve, reject) => {
    const startTime = performance.now();

    ffmpeg()
      .input("color=c=black:s=" + width + "x" + height)
      .inputOptions(["-f", "lavfi", "-t", String(duration)])
      .outputOptions([
        "-r",
        String(frameRate),
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "0",
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

createBlankVideo({
  duration: 5,
  width: 100,
  height: 100,
  frameRate: 30,
  outputPath: "/tmp/test-video1.mp4",
});

createBlankVideo({
  duration: 5,
  width: 100,
  height: 100,
  frameRate: 30,
  outputPath: "/tmp/test-video2.mp4",
});
