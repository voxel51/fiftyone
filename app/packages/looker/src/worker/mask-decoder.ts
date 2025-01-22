import { decodeWithCanvas } from "./canvas-decoder";
import { customDecode16BitPng } from "./custom-16-bit-png-decoder";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Reads the PNG's image header chunk to get bit depth & color type.
 * Returns undefined if not a PNG.
 */
const getMaybePngHeader = async (
  blob: Blob
): Promise<{ bitDepth: number; colorType: number } | undefined> => {
  // https://www.w3.org/TR/2003/REC-PNG-20031110/#11IHDR

  // PNG signature is 8 bytes
  // IHDR (image header): length(4 bytes), chunk type(4 bytes), then data(13 bytes)
  // data layout of IHDR: width(4), height(4), bit depth(1), color type(1), ...
  // color type is at offset: 8(signature) + 4(length) + 4(chunk type) + 8(width+height) + 1(bit depth)
  // Read first 29 bytes: 8 (signature) + 4 (length) + 4 (type) + 13 (IHDR data)
  const header = new Uint8Array(await blob.slice(0, 29).arrayBuffer());

  // check PNG signature
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (header[i] !== PNG_SIGNATURE[i]) {
      // not a PNG
      return undefined;
    }
  }

  // bitDepth is at offset 24, colorType at offset 25
  const bitDepth = header[24];
  const colorType = header[25];
  return { bitDepth, colorType };
};

export const decodeMaskOnDisk = async (blob: Blob, cls: string) => {
  let channels: number = 4;

  if (blob.type !== "image/jpg" && blob.type !== "image/jpeg") {
    const headerInfo = await getMaybePngHeader(blob);

    if (!headerInfo) {
      // ambiguous mask type, default to canvas decoding
      return decodeWithCanvas(blob, cls, channels);
    }

    const { bitDepth, colorType } = headerInfo;

    if (colorType !== undefined) {
      if (bitDepth === 16) {
        // browser doesn't natively parse 16 bit pngs, we'll use a 3pp library
        return customDecode16BitPng(blob);
      }

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

  return decodeWithCanvas(blob, cls, channels);
};
