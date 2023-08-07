import Jimp from "jimp";

export const createBlankImage = async (options: {
  outputPath: string;
  width: number;
  height: number;
  fillColor?: string;
}) => {
  const { width, height, outputPath, fillColor } = options;
  const startTime = performance.now();
  console.log(`Creating blank image with options: ${JSON.stringify(options)}`);
  const image = new Jimp(width, height, fillColor ?? "#00ddff");
  await image.writeAsync(outputPath);
  const endTime = performance.now();
  const timeTaken = endTime - startTime;
  console.log(`Image generation completed in ${timeTaken} milliseconds`);
};
