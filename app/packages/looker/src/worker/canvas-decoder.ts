import { HEATMAP, SEGMENTATION } from "@fiftyone/utilities";
import { Coloring } from "..";
import { OverlayMask } from "../numpy";
import { isRgbMaskTargets } from "../overlays/util";

const canvasAndCtx = (() => {
  if (typeof OffscreenCanvas !== "undefined") {
    const offScreenCanvas = new OffscreenCanvas(1, 1);
    const offScreenCanvasCtx = offScreenCanvas.getContext("2d", {
      willReadFrequently: true,
    })!;

    return { canvas: offScreenCanvas, ctx: offScreenCanvasCtx };
  }
})();

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/**
 * Reads the PNG's image header chunk to determine the color type.
 * Returns the color type if PNG, otherwise undefined.
 */
const getPngcolorType = async (blob: Blob): Promise<number | undefined> => {
  // https://www.w3.org/TR/2003/REC-PNG-20031110/#11IHDR

  // PNG signature is 8 bytes
  // IHDR (image header): length(4 bytes), chunk type(4 bytes), then data(13 bytes)
  // data layout of IHDR: width(4), height(4), bit depth(1), color type(1), ...
  // color type is at offset: 8(signature) + 4(length) + 4(chunk type) + 8(width+height) + 1(bit depth)
  // = 8 + 4 + 4 + 8 + 1 = 25 (0-based index)

  const header = new Uint8Array(await blob.slice(0, 26).arrayBuffer());

  // check PNG signature
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (header[i] !== PNG_SIGNATURE[i]) {
      // not a PNG
      return undefined;
    }
  }

  // color type at byte 25 (0-based)
  const colorType = header[25];
  return colorType;
};

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
  field: string,
  coloring: Coloring
) => {
  let channels: number = 4;

  if (blob.type === "image/png") {
    const colorType = await getPngcolorType(blob);
    if (colorType !== undefined) {
      // according to PNG specs:
      // 0: Grayscale          => 1 channel
      // 2: Truecolor (RGB)   => (would be 3 channels, but we can safely use 4)
      // 3: Indexed-color     => (palette-based, treat as non-grayscale => 4)
      // 4: Grayscale+Alpha    => Grayscale image (so treat as grayscale => 1)
      // 6: RGBA               => non-grayscale => 4
      if (colorType === 0 || colorType === 4) {
        channels = 1;
      } else {
        channels = 4;
      }
    }
  }
  // if not PNG, use 4 channels

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

  // if it's segmentation, we need to recast according to whether or not this field is mapped to RGB targets
  if (cls === SEGMENTATION) {
    let maskTargets = coloring.maskTargets?.[field];
    if (maskTargets === undefined) {
      maskTargets = coloring.defaultMaskTargets;
    }
    const isRgbMaskTargets_ = isRgbMaskTargets(maskTargets);

    if (!isRgbMaskTargets_ && channels > 1) {
      // recast to mono channel because we don't need the other channels
      targetsBuffer = recastBufferToMonoChannel(
        imageData.data,
        width,
        height,
        channels
      );
      channels = 1;
    }

    // note: for JPG segmentations with RGB mask targets, we don't need to recast
    // although depending on the JPG compression, we might have some artifacts.
    // even the slightest change in color can cause the mask to be rendered as
    // background color (transparent) instead of the actual mask color
  }

  return {
    buffer: targetsBuffer,
    channels,
    arrayType: "Uint8ClampedArray",
    shape: [height, width],
  } as OverlayMask;
};
