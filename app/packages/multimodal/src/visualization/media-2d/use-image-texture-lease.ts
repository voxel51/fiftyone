import { useEffect, useRef, useState, type MutableRefObject } from "react";

import type { ImageVisualization } from "../../ir";
import type { ImageTextureHandle } from "./Base2dScene";
import { createImageTexture } from "./image-texture";
import {
  acquireImageTexture,
  type ImageTextureLease,
} from "./image-texture-cache";
import { VideoTextureWaitError } from "./video-texture";

const EMPTY_IMAGE_DECODE_RUNWAY: readonly ImageVisualization[] = [];

/** Loading state for an encoded-image texture lease. */
export type ImageTextureLeaseStatus = "idle" | "loading" | "loaded" | "error";

/** Whether a texture error is terminal or awaiting more stream data. */
export type ImageTextureLeaseErrorKind = "failure" | "waiting";

interface HeldImageTexture {
  readonly handle: ImageTextureHandle;
  readonly release: ImageTextureLease["release"];
}

/** Inputs for `useImageTextureLease`, including cache identity and decode data. */
export interface UseImageTextureLeaseOptions {
  readonly decodeRunway?: readonly ImageVisualization[];
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
  decodeRunway = EMPTY_IMAGE_DECODE_RUNWAY,
  disabledStatus = "idle",
  enabled = true,
  frame,
  identity,
  onLoaded,
  textureKey,
}: UseImageTextureLeaseOptions): {
  readonly errorKind: ImageTextureLeaseErrorKind | null;
  readonly errorMessage: string | null;
  readonly handle: ImageTextureHandle | null;
  readonly status: ImageTextureLeaseStatus;
} {
  const heldTextureRef = useRef<HeldImageTexture | null>(null);
  const retiredTexturesRef = useRef<HeldImageTexture[]>([]);
  const hasVisibleTextureRef = useRef(false);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const [errorKind, setErrorKind] = useState<ImageTextureLeaseErrorKind | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [handle, setHandle] = useState<ImageTextureHandle | null>(null);
  const [status, setStatus] = useState<ImageTextureLeaseStatus>(() =>
    enabled && hasImageData(frame) ? "loading" : disabledStatus,
  );

  // This effect retires the held texture lease on unmount — release, not
  // dispose: keyed texture sources may be retained by the cache for instant
  // re-acquire; keyless private leases dispose themselves on release. The
  // deferred release also matters when this view leaves a shared WebGPU stage:
  // an already-submitted command buffer may still reference its texture.
  useEffect(
    () => () => {
      const heldTexture = heldTextureRef.current;
      heldTextureRef.current = null;
      retireImageTextures([
        ...(heldTexture ? [heldTexture] : []),
        ...takeRetiredTextures(retiredTexturesRef),
      ]);
    },
    [],
  );

  // This effect defers retiring a replaced texture until the replacement has
  // committed through the image scene. Releasing from the promise callback races
  // the shared WebGPU stage: it can still encode the previous portal while
  // React is committing the new handle. Even releasing on this following
  // committed render is too early for WebGPU: a command buffer submitted by
  // the previous frame can still own the texture. Keep retired leases through
  // two browser frames so the replacement portal commits and renders before
  // disposal. It intentionally precedes the request effect so a synchronous
  // disable/error transition cannot retire and schedule release in one effect
  // flush.
  useEffect(() => {
    retireImageTextures(takeRetiredTextures(retiredTexturesRef));
  });

  // This effect resolves the current encoded image into a leased texture.
  // With a `textureKey`, callers can use stable message identity as
  // `identity`, so batch re-delivery in a new bytes wrapper neither re-runs
  // this effect nor re-decodes. The previous texture stays visible until the
  // next lease resolves to avoid loading flashes during playback.
  useEffect(() => {
    if (!enabled || !hasImageData(frame)) {
      hasVisibleTextureRef.current = false;
      replaceHeldTexture(null, heldTextureRef, retiredTexturesRef, setHandle);
      setErrorKind(null);
      setErrorMessage(null);
      setStatus(disabledStatus);
      return undefined;
    }

    let cancelled = false;
    // Associate completion with the callback from the render that requested
    // this texture. This lets callers commit timestamp-coupled overlays with
    // the decoded image, even if a later render supplies another callback.
    const onLoadedForRequest = onLoadedRef.current;
    if (!hasVisibleTextureRef.current) {
      setErrorKind(null);
      setErrorMessage(null);
      setStatus("loading");
    }

    const lease = acquireImageTexture(textureKey, () =>
      createImageTexture(frame, textureKey, decodeRunway),
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
          retiredTexturesRef,
          setHandle,
        );
        hasVisibleTextureRef.current = true;
        setErrorKind(null);
        setErrorMessage(null);
        setStatus("loaded");
        onLoadedForRequest?.(decodedHandle);
      })
      .catch((error: unknown) => {
        lease.release();
        if (cancelled) {
          return;
        }

        hasVisibleTextureRef.current = false;
        replaceHeldTexture(null, heldTextureRef, retiredTexturesRef, setHandle);
        setErrorKind(
          error instanceof VideoTextureWaitError ? "waiting" : "failure",
        );
        setErrorMessage(errorMessageFromUnknown(error));
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
    // `identity`, not the frame object, is the requested lifecycle key. Keyed
    // Episode callers deliberately keep identity stable across fresh wrappers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decodeRunway, disabledStatus, enabled, identity, textureKey]);

  return { errorKind, errorMessage, handle, status };
}

export function hasImageData(
  frame: ImageVisualization | null | undefined,
): frame is ImageVisualization {
  if (!frame) {
    return false;
  }
  if (frame.kind === "encoded-image") {
    return frame.bytes.byteLength > 0;
  }
  if (frame.kind === "encoded-video") {
    return frame.bytes.byteLength > 0;
  }
  return frame.rgba.byteLength > 0 && frame.width > 0 && frame.height > 0;
}

export function imageIdentity(
  frame: ImageVisualization | null | undefined,
): unknown {
  if (!frame) {
    return frame;
  }
  return frame.kind === "raw-image" ? frame.rgba : frame.bytes;
}

function replaceHeldTexture(
  next: HeldImageTexture | null,
  heldRef: MutableRefObject<HeldImageTexture | null>,
  retiredRef: MutableRefObject<HeldImageTexture[]>,
  setHandle: (handle: ImageTextureHandle | null) => void,
) {
  const previous = heldRef.current;
  if (previous && previous !== next) {
    retiredRef.current.push(previous);
  }

  heldRef.current = next;
  setHandle(next?.handle ?? null);
}

function takeRetiredTextures(
  retiredRef: MutableRefObject<HeldImageTexture[]>,
): HeldImageTexture[] {
  const retired = retiredRef.current;
  if (retired.length === 0) {
    return [];
  }

  retiredRef.current = [];
  return retired;
}

/**
 * Releases texture leases after two paints. React commits an ImagePanel before
 * the shared WebGPU portal and GPU queue necessarily stop using its previous
 * texture; immediate disposal can otherwise trigger a destroyed-texture
 * validation error during rapid playback or seek churn.
 */
function retireImageTextures(textures: readonly HeldImageTexture[]): void {
  if (textures.length === 0) {
    return;
  }

  if (
    typeof window === "undefined" ||
    typeof window.requestAnimationFrame !== "function"
  ) {
    releaseImageTextures(textures);
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => releaseImageTextures(textures));
  });
}

function releaseImageTextures(textures: readonly HeldImageTexture[]): void {
  for (const texture of textures) {
    texture.release();
  }
}

function errorMessageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  if (hasStringMessage(error)) {
    return error.message;
  }
  return "Image unavailable";
}

function hasStringMessage(
  error: unknown,
): error is { readonly message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.length > 0
  );
}
