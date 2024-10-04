import { HorizontalAlign, Jimp, loadFont, VerticalAlign } from "jimp";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fonts = require("jimp/fonts");

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

  if (!hideLogs) {
    console.log(
      `Creating blank image with options: ${JSON.stringify(options)}`
    );
  }

  const image = new Jimp({ width, height, color: fillColor ?? "#00ddff" });

  if (options.watermarkString) {
    const font = await loadFont(fonts.SANS_10_BLACK);
    image.print({
      font,
      x: 0,
      y: 0,
      text: {
        text: options.watermarkString,
        alignmentX: HorizontalAlign.CENTER,
        alignmentY: VerticalAlign.MIDDLE,
      },
      maxWidth: width,
      maxHeight: height,
    });
  }

  await image.write(outputPath as `${string}.${string}`);
  const endTime = performance.now();
  const timeTaken = endTime - startTime;

  if (!hideLogs) {
    console.log(
      `Image generation, path = ${outputPath}, completed in ${timeTaken} milliseconds`
    );
  }
};
