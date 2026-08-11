import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import type { VideoPresentation } from "../../video/types";
import type { ImageTextureHandle } from "./Base2dScene";

interface HeldVideoTexture {
  readonly handle: ImageTextureHandle;
}

export const VIDEO_TEXTURE_RETIRE_FALLBACK_MS = 250;

/** Gives one renderer its own texture while sharing the copied presentation. */
export function useVideoTexture(
  presentation: VideoPresentation | null,
  onLoaded?: (handle: ImageTextureHandle) => void,
): ImageTextureHandle | null {
  const [handle, setHandle] = useState<ImageTextureHandle | null>(null);
  const heldRef = useRef<HeldVideoTexture | null>(null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    if (!presentation) return undefined;
    const lease = presentation.acquire();
    if (!lease) return undefined;
    const texture = new THREE.Texture(lease.source as TexImageSource);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    let disposed = false;
    const next: HeldVideoTexture = {
      handle: {
        aspectRatio: lease.width / Math.max(1, lease.height),
        dispose: () => {
          if (disposed) return;
          disposed = true;
          texture.dispose();
          lease.release();
        },
        imageHeight: lease.height,
        imageWidth: lease.width,
        retainWhenUnused: false,
        texture,
      },
    };
    const previous = heldRef.current;
    heldRef.current = next;
    setHandle(next.handle);
    onLoadedRef.current?.(next.handle);
    if (previous) retireVideoTexture(previous);

    return () => {
      if (heldRef.current !== next) return;
      heldRef.current = null;
      setHandle((current) => (current === next.handle ? null : current));
      retireVideoTexture(next);
    };
  }, [presentation]);

  return handle;
}

function retireVideoTexture(texture: HeldVideoTexture): void {
  if (
    typeof window === "undefined" ||
    typeof window.requestAnimationFrame !== "function"
  ) {
    texture.handle.dispose();
    return;
  }
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    window.clearTimeout(timeout);
    texture.handle.dispose();
  };
  const timeout = window.setTimeout(dispose, VIDEO_TEXTURE_RETIRE_FALLBACK_MS);
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(dispose);
  });
}
