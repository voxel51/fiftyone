import type { SampleRendererLoadingProps } from "@fiftyone/plugins";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { MosaicNode } from "react-mosaic-component";
import type { ByteSourceReadProfile, SceneSource } from "../../../ir";
import { readModalLayout } from "../layout/layout-persistence";
import { clampSidebarWidth, SIDEBAR_SIZE_PX } from "../layout/sidebar-geometry";
import {
  collectPlaybackDeviceCapabilities,
  resolvePlaybackLayout,
} from "../layout/playback-layout";

/** Geometry known before the destination's playback session is ready. */
export interface LoadingLayout {
  readonly layout: MosaicNode<string> | null;
  readonly titles: Readonly<Record<string, string>>;
  readonly posterTileId: string | null;
  readonly leftOpen: boolean;
  readonly leftWidth: number;
  readonly tracksOpen: boolean;
}

const hints = new Map<string, LoadingLayout>();
const listeners = new Set<() => void>();
const keyFor = (identity: SampleRendererLoadingProps) =>
  JSON.stringify([identity.datasetId, identity.mediaField, identity.sampleId]);

/** Shares only layout geometry from grid inventory, without owning a session. */
export function publishLoadingLayout(
  identity: SampleRendererLoadingProps,
  sources: readonly SceneSource[],
  readProfile?: ByteSourceReadProfile,
  posterSourceName?: string | null,
): void {
  if (!identity.sampleId || sources.length === 0) return;
  const resolved = resolvePlaybackLayout({
    sources,
    readProfile,
    capabilities: collectPlaybackDeviceCapabilities(),
  });
  const source = sources.find(
    (source) => source.sourceName === posterSourceName,
  );
  const posterTile = source
    ? resolved.tiles.find((tile) =>
        source.type === "point-cloud"
          ? tile.tileType === "3d"
          : tile.initialSourceId === source.id,
      )
    : undefined;
  const value: LoadingLayout = {
    layout: resolved.layout ?? null,
    titles: Object.fromEntries(
      resolved.tiles.map((tile) => [tile.id, tile.title]),
    ),
    posterTileId: posterTile?.id ?? null,
    leftOpen: true,
    leftWidth: SIDEBAR_SIZE_PX,
    tracksOpen: false,
  };
  const key = keyFor(identity);
  if (JSON.stringify(hints.get(key)) === JSON.stringify(value)) return;
  hints.delete(key);
  hints.set(key, value);
  while (hints.size > 64) hints.delete(hints.keys().next().value as string);
  for (const listener of listeners) listener();
}

function readLoadingLayout(
  identity: SampleRendererLoadingProps,
  hint?: LoadingLayout,
): LoadingLayout {
  const saved = readModalLayout(identity.datasetId);
  const layout = saved?.expandedTileId ?? saved?.layout ?? hint?.layout ?? null;
  return {
    layout: saved?.layout === null ? null : layout,
    titles: { ...hint?.titles, ...saved?.tileTitles },
    posterTileId: hint?.posterTileId ?? null,
    leftOpen: saved?.leftSidebarOpen ?? true,
    leftWidth: clampSidebarWidth(saved?.sidebarWidthPx ?? SIDEBAR_SIZE_PX),
    tracksOpen: saved?.timelineTracksOpen ?? false,
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Saved geometry is available even before either the sample or module loads. */
export function useLoadingLayout(
  identity: SampleRendererLoadingProps,
): LoadingLayout {
  const key = keyFor(identity);
  const snapshot = useCallback(() => hints.get(key), [key]);
  const hint = useSyncExternalStore(subscribe, snapshot, () => undefined);
  const { datasetId, mediaField, sampleId } = identity;
  return useMemo(
    () => readLoadingLayout({ datasetId, mediaField, sampleId }, hint),
    [datasetId, mediaField, sampleId, hint],
  );
}

/** A loading pane's percentage bounds within the media viewport. */
export interface LoadingPane {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Projects the same Mosaic split percentages used by the live viewer. */
export function loadingPanes(
  layout: MosaicNode<string> | null,
): readonly LoadingPane[] {
  const result: LoadingPane[] = [];
  const visit = (
    node: MosaicNode<string>,
    left: number,
    top: number,
    width: number,
    height: number,
  ) => {
    if (typeof node === "string") {
      result.push({ id: node, left, top, width, height });
      return;
    }
    const split = (node.splitPercentage ?? 50) / 100;
    if (node.direction === "row") {
      visit(node.first, left, top, width * split, height);
      visit(
        node.second,
        left + width * split,
        top,
        width * (1 - split),
        height,
      );
    } else {
      visit(node.first, left, top, width, height * split);
      visit(
        node.second,
        left,
        top + height * split,
        width,
        height * (1 - split),
      );
    }
  };
  if (layout) visit(layout, 0, 0, 100, 100);
  return result;
}
