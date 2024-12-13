import { OverlayMask } from "../numpy";

/**
 * Checks if the given pixel data is grayscale by sampling a subset of pixels.
 * The function will check at least 500 pixels or 1% of all pixels, whichever is larger.
 * If the image is grayscale, the R, G, and B channels will be equal for all sampled pixels,
 * and the alpha channel will always be 255.
 */
export const isGrayscale = (data: Uint8ClampedArray): boolean => {
  const totalPixels = data.length / 4;
  const checks = Math.max(500, Math.floor(totalPixels * 0.01));
  const step = Math.max(1, Math.floor(totalPixels / checks));

  for (let p = 0; p < totalPixels; p += step) {
    const i = p * 4;
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a !== 255 || r !== g || g !== b) {
      return false;
    }
  }
  return true;
};

/**
 * Decodes a given image source into an OverlayMask using an OffscreenCanvas
 */
export const decodeWithCanvas = async (blob: ImageBitmapSource) => {
  const imageBitmap = await createImageBitmap(blob);
  const width = imageBitmap.width;
  const height = imageBitmap.height;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(imageBitmap, 0, 0);
  imageBitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);

  // for nongrayscale images, channel is guaranteed to be 4 (RGBA)
  const channels = isGrayscale(imageData.data) ? 1 : 4;

  if (channels === 1) {
    // get rid of the G, B, and A channels, new buffer will be 1/4 the size
    const data = new Uint8ClampedArray(width * height);
    for (let i = 0; i < data.length; i++) {
      data[i] = imageData.data[i * 4];
    }
    imageData.data.set(data);
  }

  return {
    buffer: imageData.data.buffer,
    channels,
    arrayType: "Uint8ClampedArray",
    shape: [height, width],
  } as OverlayMask;
};
