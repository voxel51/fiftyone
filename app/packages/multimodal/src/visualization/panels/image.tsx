import type { CSSProperties, MutableRefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { EncodedImageVisualization } from "../../decoders";
import {
  Base2DScene,
  ImageTexturePlane,
  type ImageTextureHandle,
} from "./base-2d-scene";
import { WebGpuCanvas } from "./webgpu-canvas";

type ImageLoadStatus = "loading" | "loaded" | "error";

const ORTHOGRAPHIC_IMAGE_CAMERA = {
  far: 10,
  near: -10,
  position: [0, 0, 1] as [number, number, number],
  zoom: 1,
};

export interface ImagePanelProps {
  readonly alt?: string;
  readonly className?: string;
  readonly fit?: "contain" | "cover";
  readonly frame: EncodedImageVisualization;
  readonly style?: CSSProperties;
}

/**
 * Production image visualization panel backed by a stable Three.js canvas.
 */
export function ImagePanel({
  alt: _alt = "Image",
  className,
  fit = "contain",
  frame,
  style,
}: ImagePanelProps) {
  const textureHandleRef = useRef<ImageTextureHandle | null>(null);
  const hasVisibleImageRef = useRef(false);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [status, setStatus] = useState<ImageLoadStatus>("loading");
  const [textureHandle, setTextureHandle] = useState<ImageTextureHandle | null>(
    null
  );
  const scene = useMemo(
    () => (
      <Base2DScene>
        <ImageTexturePlane fit={fit} textureHandle={textureHandle} />
      </Base2DScene>
    ),
    [fit, textureHandle]
  );

  useEffect(() => {
    return () => {
      textureHandleRef.current?.dispose();
      textureHandleRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (frame.bytes.byteLength === 0) {
      hasVisibleImageRef.current = false;
      setStatus("error");
      replaceTextureHandle(null, textureHandleRef, setTextureHandle);
      return undefined;
    }

    let cancelled = false;
    if (!hasVisibleImageRef.current) {
      setStatus("loading");
    }

    createImageTexture(frame.bytes, frame.mimeType)
      .then((handle) => {
        if (cancelled) {
          handle.dispose();
          return;
        }

        replaceTextureHandle(handle, textureHandleRef, setTextureHandle);
        hasVisibleImageRef.current = true;
        setStatus("loaded");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setStatus("error");
        hasVisibleImageRef.current = false;
        replaceTextureHandle(null, textureHandleRef, setTextureHandle);
      });

    return () => {
      cancelled = true;
    };
  }, [frame.bytes, frame.mimeType]);

  return (
    <div className={className} style={{ ...styles.panel, ...style }}>
      <WebGpuCanvas
        camera={ORTHOGRAPHIC_IMAGE_CAMERA}
        onError={setCanvasError}
        orthographic
        role="img"
        style={styles.canvas}
      >
        {scene}
      </WebGpuCanvas>

      {canvasError || status !== "loaded" ? (
        <div style={styles.status}>
          {canvasError ??
            (status === "error" ? "Image unavailable" : "Loading image")}
        </div>
      ) : null}
    </div>
  );
}

function replaceTextureHandle(
  nextHandle: ImageTextureHandle | null,
  handleRef: MutableRefObject<ImageTextureHandle | null>,
  setHandle: (handle: ImageTextureHandle | null) => void
) {
  const previousHandle = handleRef.current;
  if (previousHandle && previousHandle !== nextHandle) {
    previousHandle.dispose();
  }

  handleRef.current = nextHandle;
  setHandle(nextHandle);
}

async function createImageTexture(
  bytes: Uint8Array,
  mimeType: string | undefined
): Promise<ImageTextureHandle> {
  const blob = new Blob([bytes as BlobPart], {
    type: mimeType ?? "image/jpeg",
  });

  if (typeof createImageBitmap === "function") {
    const image = await createImageBitmap(blob);
    const texture = textureFromImage(image);

    return {
      aspectRatio: image.width / Math.max(1, image.height),
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

const styles: Record<string, CSSProperties> = {
  canvas: {
    display: "block",
    height: "100%",
    width: "100%",
  },
  panel: {
    background: "#050b12",
    boxSizing: "border-box",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  status: {
    alignItems: "center",
    color: "#9fb3c8",
    display: "flex",
    fontSize: 13,
    inset: 0,
    justifyContent: "center",
    padding: 16,
    position: "absolute",
    textAlign: "center",
  },
};
