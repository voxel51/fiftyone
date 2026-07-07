/**
 * Shared encoded-image → Three.js texture decoding, used by the 2D image
 * panel and by 3D consumers that texture scene geometry with camera
 * frames (e.g. frustum image planes).
 */
import * as THREE from "three";

import type { ImageTextureHandle } from "./base-2d-scene";

/**
 * Decodes encoded image bytes (JPEG/PNG/...) into a disposable texture
 * handle. Prefers `createImageBitmap` and falls back to an HTML image
 * element where the API is unavailable (some test environments).
 */
export async function createImageTexture(
  bytes: Uint8Array,
  mimeType: string | undefined,
): Promise<ImageTextureHandle> {
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
