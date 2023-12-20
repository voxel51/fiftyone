import Jimp from "jimp";

export const createBlankImage = async (options: {
  outputPath: string;
  width: number;
  height: number;
  fillColor?: string;
  watermarkString?: string;
  hideLogs?: boolean;
}) => {
  const { width, height, outputPath, fillColor, hideLogs } = options;
  const startTime = performance.now();
  !hideLogs &&
    console.log(
      `Creating blank image with options: ${JSON.stringify(options)}`
    );
  const image = new Jimp(width, height, fillColor ?? "#00ddff");

  if (options.watermarkString) {
    const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    image.print(
      font,
      0,
      0,
      {
        text: options.watermarkString,
        alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
        alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
      },
      width,
      height
    );
  }

  await image.writeAsync(outputPath);
  const endTime = performance.now();
  const timeTaken = endTime - startTime;
  !hideLogs &&
    console.log(
      `Image generation, path = ${outputPath}, completed in ${timeTaken} milliseconds`
    );
};
