/**
 * Shared encoded-image → Three.js texture decoding, used by the 2D image
 * panel and by 3D consumers that texture scene geometry with camera
 * frames (e.g. frustum image planes).
 */
import * as THREE from "three";

import type {
  EncodedImageVisualization,
  ImageVisualization,
  RawImageVisualization,
} from "../../decoders";
import type { ImageTextureHandle } from "./base-2d-scene";

/**
 * Decodes an image visualization into a disposable texture handle.
 */
export async function createImageTexture(
  frame: ImageVisualization,
): Promise<ImageTextureHandle> {
  return frame.kind === "raw-image"
    ? createRawImageTexture(frame)
    : createEncodedImageTexture(frame);
}

/**
 * Decodes encoded image bytes (JPEG/PNG/...) into a disposable texture
 * handle. Prefers `createImageBitmap` and falls back to an HTML image
 * element where the API is unavailable (some test environments).
 */
async function createEncodedImageTexture(
  frame: EncodedImageVisualization,
): Promise<ImageTextureHandle> {
  const { bytes, mimeType } = frame;
  const blob = new Blob([bytes as BlobPart], {
    type: mimeType ?? "image/jpeg",
  });

  if (typeof createImageBitmap === "function") {
    const image = await createImageBitmap(blob);
    const texture = textureFromImage(image);

    return {
      aspectRatio: image.width / Math.max(1, image.height),
      imageWidth: image.width,
      imageHeight: image.height,
      dispose: () => {
        texture.dispose();
        image.close();
      },
      texture,
    };
  }

  const image = await loadHtmlImage(blob);
  const texture = textureFromImage(image);

  return {
    aspectRatio: image.naturalWidth / Math.max(1, image.naturalHeight),
    imageWidth: image.naturalWidth,
    imageHeight: image.naturalHeight,
    dispose: () => texture.dispose(),
    texture,
  };
}

function createRawImageTexture(
  frame: RawImageVisualization,
): ImageTextureHandle {
  const texture = new THREE.DataTexture(
    frame.rgba,
    frame.width,
    frame.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.generateMipmaps = false;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return {
    aspectRatio: frame.width / Math.max(1, frame.height),
    imageWidth: frame.width,
    imageHeight: frame.height,
    dispose: () => texture.dispose(),
    texture,
  };
}

function textureFromImage(image: TexImageSource): THREE.Texture {
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

async function loadHtmlImage(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";

  try {
    image.src = objectUrl;
    if (image.decode) {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Image failed to load"));
      });
    }

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
