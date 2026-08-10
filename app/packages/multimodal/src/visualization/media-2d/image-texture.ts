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
} from "../../ir";
import type { ImageTextureHandle } from "./Base2dScene";

type NativeDepthTexture = THREE.DataTexture & {
  normalized: boolean;
};

/**
 * Decodes an image visualization into a disposable texture handle.
 */
export async function createImageTexture(
  frame: ImageVisualization,
  textureKey?: string,
): Promise<ImageTextureHandle> {
  if (frame.kind === "raw-image") {
    return createRawImageTexture(frame);
  }
  return createEncodedImageTexture(frame);
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
  if (frame.depth) {
    return createDepthImageTexture(frame);
  }
  const expectedByteLength = frame.width * frame.height * 4;
  if (frame.rgba.byteLength < expectedByteLength) {
    throw new Error("Raw image frame has too few RGBA bytes");
  }

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

function createDepthImageTexture(
  frame: RawImageVisualization,
): ImageTextureHandle {
  const depth = frame.depth;
  if (!depth || depth.values.length !== frame.width * frame.height) {
    throw new Error("Raw depth frame has the wrong number of samples");
  }

  const isUint16 = depth.values instanceof Uint16Array;
  const texture = new THREE.DataTexture(
    depth.values,
    frame.width,
    frame.height,
    THREE.RedFormat,
    // Three only declares unsigned integer texture bindings for
    // UnsignedIntType. The internal format below keeps the actual upload at
    // 16 bits and its uploader selects Uint16Array from that format.
    isUint16 ? THREE.UnsignedIntType : THREE.FloatType,
  ) as NativeDepthTexture;
  // r16uint and r32float keep source samples single-channel and native-width.
  // Three's public internal-format type only lists WebGL names today.
  if (isUint16) texture.internalFormat = "r16uint" as THREE.PixelFormatGPU;
  texture.normalized = false;
  texture.colorSpace = THREE.NoColorSpace;
  // Avoid Three's render-pass-based WebGPU flip, which cannot target integer
  // formats and would add a hidden full-frame GPU copy. The depth material
  // maps display UVs back to top-left source rows instead.
  texture.flipY = false;
  texture.generateMipmaps = false;
  // r32float is unfilterable; nearest also keeps invalid pixels from blending
  // into neighboring valid depth before the shader's alpha decision.
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  return {
    aspectRatio: frame.width / Math.max(1, frame.height),
    decodedByteLength: depth.values.byteLength,
    depthDisplay: {
      maxSampleValue: depth.maxValue,
      minSampleValue: depth.minValue,
    },
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
