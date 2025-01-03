import type { OverlayMask } from "./types";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/**
 * Reads the PNG's image header chunk to determine the color type.
 * Returns the color type if PNG, otherwise undefined.
 */
const getPngcolorType = async (blob: Blob): Promise<number | undefined> => {
  // https://www.w3.org/TR/2003/REC-PNG-20031110/#11IHDR

  // PNG signature is 8 bytes
  // IHDR (image header): length(4 bytes), chunk type(4 bytes),
  // then data(13 bytes)
  //
  // data layout of IHDR: width(4), height(4), bit depth(1), color type(1), ...
  //
  // color type is at offset:
  // 8(signature) + 4(length) + 4(chunk type) + 8(width+height) + 1(bit depth)
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

const decodeWithCanvas = async (blob: Blob): Promise<OverlayMask> => {
  let channels = 4;

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

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imageBitmap, 0, 0);
  imageBitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);

  if (channels === 1) {
    // get rid of the G, B, and A channels, new buffer will be 1/4 the size
    const data = new Uint8ClampedArray(width * height);
    for (let i = 0; i < data.length; i++) {
      data[i] = imageData.data[i * 4];
    }
    imageData.data.set(data);
  }

  return {
    arrayType: "Uint8ClampedArray",
    buffer: imageData.data.buffer,
    channels,
    shape: [height, width],
  };
};

export default decodeWithCanvas;
