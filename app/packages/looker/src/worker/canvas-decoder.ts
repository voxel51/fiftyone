import { HEATMAP } from "@fiftyone/utilities";
import { OverlayMask } from "../numpy";

const canvasAndCtx = (() => {
  if (typeof OffscreenCanvas !== "undefined") {
    const offScreenCanvas = new OffscreenCanvas(1, 1);
    const offScreenCanvasCtx = offScreenCanvas.getContext("2d", {
      willReadFrequently: true,
    })!;

    return { canvas: offScreenCanvas, ctx: offScreenCanvasCtx };
  }
})();

/**
 * Sets the buffer in place to grayscale by removing the G, B, and A channels.
 *
 * This is meant for images that are packed like the following, since the other channels are storing redundant data:
 *
 * X, X, X, 255, Y, Y, Y, 255, Z, Z, Z, 255, ...
 */
export const recastBufferToMonoChannel = (
  uint8Array: Uint8ClampedArray,
  width: number,
  height: number,
  stride: number
) => {
  const totalPixels = width * height;

  let read = 0;
  let write = 0;

  while (write < totalPixels) {
    uint8Array[write++] = uint8Array[read];
    read += stride;
  }

  return uint8Array.slice(0, totalPixels).buffer;
};

export const decodeWithCanvas = async (
  blob: Blob,
  cls: string,
  numOriginalChannels: number
) => {
  let channels: number = numOriginalChannels;

  const imageBitmap = await createImageBitmap(blob);
  const { width, height } = imageBitmap;

  const { canvas: offScreenCanvas, ctx: offScreenCanvasCtx } = canvasAndCtx!;

  offScreenCanvas.width = width;
  offScreenCanvas.height = height;

  offScreenCanvasCtx.drawImage(imageBitmap, 0, 0);

  imageBitmap.close();

  const imageData = offScreenCanvasCtx.getImageData(0, 0, width, height);

  let targetsBuffer = imageData.data.buffer;

  if (channels === 1) {
    // recasting because we know from png header that it's grayscale,
    // but when we decoded using canvas, it's RGBA
    targetsBuffer = recastBufferToMonoChannel(imageData.data, width, height, 4);
  }

  if (cls === HEATMAP && channels > 1) {
    // recast to mono channel because we don't need the other channels
    targetsBuffer = recastBufferToMonoChannel(
      imageData.data,
      width,
      height,
      channels
    );
    channels = 1;
  }

  return {
    buffer: targetsBuffer,
    channels,
    arrayType: "Uint8ClampedArray",
    shape: [height, width],
  } as OverlayMask;
};
