import { OverlayMask } from "../numpy";
// temporary fix to run app
let offScreenCanvas: OffscreenCanvas | null = null;
if (typeof OffscreenCanvas === "undefined") {
  console.error("OffscreenCanvas not supported");
} else {
  offScreenCanvas = new OffscreenCanvas(1, 1);
}
const offScreenCanvasCtx = offScreenCanvas?.getContext("2d", {
  willReadFrequently: true,
});

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

export const decodeWithCanvas = async (blob: Blob) => {
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

  offScreenCanvas!.width = width;
  offScreenCanvas!.height = height;

  offScreenCanvasCtx!.drawImage(imageBitmap, 0, 0);

  imageBitmap.close();

  const imageData = offScreenCanvasCtx.getImageData(0, 0, width, height);

  if (channels === 1) {
    // get rid of the G, B, and A channels, new buffer will be 1/4 the size
    const rawBuffer = imageData.data;
    const totalPixels = width * height;

    let read = 0;
    let write = 0;

    while (write < totalPixels) {
      rawBuffer[write++] = rawBuffer[read];
      // skip "G,B,A"
      read += 4;
    }

    const grayScaleData = rawBuffer.slice(0, totalPixels);
    rawBuffer.set(grayScaleData);
  }

  return {
    buffer: imageData.data.buffer,
    channels,
    arrayType: "Uint8ClampedArray",
    shape: [height, width],
  } as OverlayMask;
};
