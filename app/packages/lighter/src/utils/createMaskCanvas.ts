export const createMaskCanvas = (
  width = 0,
  height = 0,
  xOffset = 0,
  yOffset = 0,
  maskBitmap?: ImageBitmap
) => {
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskContext = maskCanvas.getContext("2d", {
    willReadFrequently: true,
  })!;

  if (!maskContext) throw new Error("Failed to get 2d context");

  if (maskBitmap) {
    maskContext.drawImage(maskBitmap, xOffset, yOffset);
  }

  return {
    maskCanvas,
    maskContext,
  };
};
