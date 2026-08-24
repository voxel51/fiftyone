import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import type {
  VideoPresentation,
  VideoPresentationLease,
} from "../../video/types";
import type { ImageTextureHandle } from "./Base2dScene";

interface HeldVideoTexture {
  currentLease: VideoPresentationLease | null;
  disposed: boolean;
  readonly texture: THREE.Texture;
}

/** Gives one renderer a stable texture while sharing each copied presentation. */
export function useVideoTexture(
  presentation: VideoPresentation | null,
  onLoaded?: (handle: ImageTextureHandle) => void,
): ImageTextureHandle | null {
  const [handle, setHandle] = useState<ImageTextureHandle | null>(null);
  const heldRef = useRef<HeldVideoTexture | null>(null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  // This effect updates the source of one renderer-owned texture and releases
  // the presentation that it replaces.
  useEffect(() => {
    if (!presentation) {
      disposeHeldVideoTexture(heldRef.current);
      heldRef.current = null;
      setHandle(null);
      return;
    }
    const lease = presentation.acquire();
    if (!lease) return;
    let held = heldRef.current;
    if (!held) {
      const texture = new THREE.Texture();
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = false;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      held = { currentLease: null, disposed: false, texture };
      heldRef.current = held;
    }
    const previousLease = held.currentLease;
    held.currentLease = lease;
    held.texture.image = lease.source as TexImageSource;
    // Reusing the texture keeps materials and WebGPU resources stable. The
    // handle identity still changes so the demand-rendered scene invalidates.
    held.texture.needsUpdate = true;
    previousLease?.release();
    const owned = held;
    const next: ImageTextureHandle = {
      aspectRatio: lease.width / Math.max(1, lease.height),
      dispose: () => disposeHeldVideoTexture(owned),
      imageHeight: lease.height,
      imageWidth: lease.width,
      retainWhenUnused: false,
      texture: held.texture,
    };
    setHandle(next);
    onLoadedRef.current?.(next);
  }, [presentation]);

  // This effect releases the stable texture and final presentation on unmount.
  useEffect(
    () => () => {
      disposeHeldVideoTexture(heldRef.current);
      heldRef.current = null;
    },
    [],
  );

  return handle;
}

function disposeHeldVideoTexture(held: HeldVideoTexture | null): void {
  if (!held || held.disposed) return;
  held.disposed = true;
  held.texture.dispose();
  held.currentLease?.release();
  held.currentLease = null;
}
