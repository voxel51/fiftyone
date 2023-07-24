import Jimp from "jimp";

export const createBlankImage = async (options: {
  width: number;
  height: number;
  fileName: string;
  fillColor?: string;
}) => {
  const { width, height, fileName, fillColor } = options;
  const startTime = performance.now();
  console.log(`Creating blank image with options: ${JSON.stringify(options)}`);
  const image = new Jimp(width, height, fillColor ?? "#000000");
  await image.writeAsync(fileName);
  const endTime = performance.now();
  const timeTaken = endTime - startTime;
  console.log(`Image generation completed in ${timeTaken} milliseconds`);
};
