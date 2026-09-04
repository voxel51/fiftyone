import { useTileId } from "@fiftyone/tiling";
import { useStore } from "jotai";
import { useEffect, useRef } from "react";
import {
  tileMediaSurfacesAtom,
  type TileMediaSurface,
} from "../../../extensions/tiles/media-surfaces";
import type { SceneSource } from "../../../ir";
import {
  imageDisplayRect,
  transformedImageDisplayRect,
  type ImageDisplaySize,
  type ImageViewTransform,
} from "../../../visualization/media-2d/Base2dScene";

/** What a registering tile knows about its own media presentation. */
export type TileMediaSurfaceConfig = {
  /** The tile's media viewport element (null while unmounted). */
  element: HTMLElement | null;
  /** The scene source the tile currently displays (null while unbound). */
  source: SceneSource | null;
  /** Natural media dimensions (null until the first frame loads). */
  imageSize: ImageDisplaySize | null;
  fit: "contain" | "cover";
  viewTransform: ImageViewTransform;
  /** Content time of the displayed frame, or null. */
  contentTimeNs: bigint | null;
};

/**
 * Publishes the surrounding tile's media surface into
 * `extensions/tiles/media-surfaces` while it is mounted and bound to a
 * source. Per-frame and per-gesture values (rect inputs, content time) are
 * read through a ref by the getters, so the entry itself is republished only
 * when the tile's identity changes. Mirrors `tile-source-bindings.ts`.
 */
export function useRegisterTileMediaSurface(
  config: TileMediaSurfaceConfig,
): void {
  const tileId = useTileId();
  const store = useStore();

  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  });

  const { element } = config;
  const sourceType = config.source?.type ?? null;
  const sourceName = config.source?.sourceName ?? null;

  useEffect(() => {
    if (!tileId || !element || sourceType === null || sourceName === null) {
      return undefined;
    }
    const surface: TileMediaSurface = {
      tileId,
      source: { type: sourceType, name: sourceName },
      element,
      getMediaRect: () => {
        const current = configRef.current;
        if (!current.element || !current.imageSize) return null;
        const box = current.element.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) return null;
        const rect = transformedImageDisplayRect(
          imageDisplayRect(
            { width: box.width, height: box.height },
            current.imageSize,
            current.fit,
          ),
          current.viewTransform,
        );
        return {
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        };
      },
      getContentTimeNs: () => configRef.current.contentTimeNs,
    };
    store.set(tileMediaSurfacesAtom, (prev) => ({
      ...prev,
      [tileId]: surface,
    }));
    return () => {
      store.set(tileMediaSurfacesAtom, (prev) => {
        if (prev[tileId] !== surface) return prev;
        const next = { ...prev };
        delete next[tileId];
        return next;
      });
    };
  }, [tileId, element, sourceType, sourceName, store]);
}
