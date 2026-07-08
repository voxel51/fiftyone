import { useEffect, useRef, useState, type MutableRefObject } from "react";

import type { ImageVisualization } from "../../decoders";
import type { ImageTextureHandle } from "./base-2d-scene";
import { createImageTexture } from "./image-texture";
import {
  acquireImageTexture,
  type ImageTextureLease,
} from "./image-texture-cache";

/** Loading state for an encoded-image texture lease. */
export type ImageTextureLeaseStatus = "idle" | "loading" | "loaded" | "error";

interface HeldImageTexture {
  readonly handle: ImageTextureHandle;
  readonly release: ImageTextureLease["release"];
}

/** Inputs for `useImageTextureLease`, including cache identity and decode data. */
export interface UseImageTextureLeaseOptions {
  readonly disabledStatus?: ImageTextureLeaseStatus;
  readonly enabled?: boolean;
  readonly frame: ImageVisualization | null | undefined;
  readonly identity: unknown;
  readonly onLoaded?: (handle: ImageTextureHandle) => void;
  readonly textureKey?: string;
}

/**
 * Decodes encoded image bytes into a cached or private texture lease and
 * releases the previous lease when the requested image changes.
 */
export function useImageTextureLease({
  disabledStatus = "idle",
  enabled = true,
  frame,
  identity,
  onLoaded,
  textureKey,
}: UseImageTextureLeaseOptions): {
  readonly handle: ImageTextureHandle | null;
  readonly status: ImageTextureLeaseStatus;
} {
  const heldTextureRef = useRef<HeldImageTexture | null>(null);
  const hasVisibleTextureRef = useRef(false);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const [handle, setHandle] = useState<ImageTextureHandle | null>(null);
  const [status, setStatus] = useState<ImageTextureLeaseStatus>(() =>
    enabled && hasImageData(frame) ? "loading" : disabledStatus,
  );

  // This effect releases the held texture lease on unmount — release, not
  // dispose: keyed texture sources may be retained by the cache for instant
  // re-acquire; keyless private leases dispose themselves on release.
  useEffect(
    () => () => {
      heldTextureRef.current?.release();
      heldTextureRef.current = null;
    },
    [],
  );

  // This effect resolves the current encoded image into a leased texture.
  // With a `textureKey`, callers can use stable message identity as
  // `identity`, so batch re-delivery in a new bytes wrapper neither re-runs
  // this effect nor re-decodes. The previous texture stays visible until the
  // next lease resolves to avoid loading flashes during playback.
  useEffect(() => {
    if (!enabled || !hasImageData(frame)) {
      hasVisibleTextureRef.current = false;
      replaceHeldTexture(null, heldTextureRef, setHandle);
      setStatus(disabledStatus);
      return undefined;
    }

    let cancelled = false;
    if (!hasVisibleTextureRef.current) {
      setStatus("loading");
    }

    const lease = acquireImageTexture(textureKey, () =>
      createImageTexture(frame),
    );
    lease.promise
      .then((decodedHandle) => {
        if (cancelled) {
          lease.release();
          return;
        }

        replaceHeldTexture(
          { handle: decodedHandle, release: lease.release },
          heldTextureRef,
          setHandle,
        );
        hasVisibleTextureRef.current = true;
        setStatus("loaded");
        onLoadedRef.current?.(decodedHandle);
      })
      .catch(() => {
        lease.release();
        if (cancelled) {
          return;
        }

        hasVisibleTextureRef.current = false;
        replaceHeldTexture(null, heldTextureRef, setHandle);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
    // `identity`, not the frame object, is the requested lifecycle key. Keyed
    // MCAP callers deliberately keep identity stable across fresh wrappers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabledStatus, enabled, identity, textureKey]);

  return { handle, status };
}

function hasImageData(
  frame: ImageVisualization | null | undefined,
): frame is ImageVisualization {
  if (!frame) {
    return false;
  }
  if (frame.kind === "encoded-image") {
    return frame.bytes.byteLength > 0;
  }
  return frame.rgba.byteLength > 0 && frame.width > 0 && frame.height > 0;
}

function replaceHeldTexture(
  next: HeldImageTexture | null,
  heldRef: MutableRefObject<HeldImageTexture | null>,
  setHandle: (handle: ImageTextureHandle | null) => void,
) {
  const previous = heldRef.current;
  if (previous && previous !== next) {
    previous.release();
  }

  heldRef.current = next;
  setHandle(next?.handle ?? null);
}
