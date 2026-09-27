import { VideoLooker } from "@fiftyone/looker";
import {
  mcapGridOverlayKey,
  useMcapGridOverlays,
  useSampleRendererFirstMatch,
} from "@fiftyone/multimodal/extensions/timeline";
import type { IntervalTileContext } from "@fiftyone/multimodal/extensions/episode-intervals";
import { EpisodeGridOverlay } from "@fiftyone/multimodal/grid-overlay";
import * as fos from "@fiftyone/state";
import { MEDIA_TYPE_VIDEO } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import {
  useRecoilBridgeAcrossReactRoots_UNSTABLE,
  useRecoilValue,
} from "recoil";

/**
 * Overlay host for tiles the grid renders with the default looker.
 *
 * A custom-renderer tile is a React tree, so `GridCustomRendererItem` can nest
 * the interval lane inside it. A default looker is not: the grid hands
 * spotlight a bare element and the looker paints a canvas into it. Video tiles
 * take that path, so the lane needs its own root mounted onto the same element
 * and torn down when spotlight recycles it.
 */
const HOST_STYLES: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  left: "0",
  right: "0",
  bottom: "0",
  display: "flex",
  flexDirection: "column",
  pointerEvents: "none",
  zIndex: "10",
};

type MountedOverlay = { readonly root: Root; readonly host: HTMLElement };

/** The only thing a tile lane needs off the sample: its id and media type. */
type TileSample = {
  readonly sample?: {
    readonly _id?: string;
    readonly media_type?: string | null;
    readonly _media_type?: string | null;
    readonly metadata?: { readonly duration?: number | null } | null;
  };
};

const NS_PER_SECOND = 1_000_000_000;

/** The tile's clip length in seconds, from its looker once the poster has
 * loaded; null before then, or for a tile with no video looker. */
function useLookerDuration(looker: VideoLooker | null): number | null {
  const [duration, setDuration] = useState(() => looker?.duration ?? null);
  useEffect(() => {
    if (!looker) return undefined;
    const read = () => setDuration(looker.duration ?? null);
    read();
    looker.addEventListener("load", read);
    return () => looker.removeEventListener("load", read);
  }, [looker]);

  return duration;
}

/**
 * Shows the tile at its first matched window while a selection hits it, and
 * back at its start once none does. Waits for the poster, which is what the
 * looker's duration signals.
 */
function useScrubToFirstMatch(
  looker: VideoLooker | null,
  ctx: IntervalTileContext,
  loaded: boolean,
) {
  const firstMatch = useSampleRendererFirstMatch(ctx);
  const startNs = firstMatch?.startNs ?? null;
  const scrubbed = useRef(false);
  useEffect(() => {
    if (!looker || !loaded) return;
    if (startNs !== null) {
      looker.posterAt(Number(startNs) / NS_PER_SECOND);
      scrubbed.current = true;
    } else if (scrubbed.current) {
      looker.posterAt(null);
      scrubbed.current = false;
    }
  }, [looker, loaded, startNs]);
}

/** The lanes one video tile draws: its temporal tags where the dataset can
 * carry them, then whatever the edition registered. */
function VideoTileLanes({
  datasetId,
  sampleId,
  metadataDurationNs,
  looker,
  showTags,
}: {
  readonly datasetId: string;
  readonly sampleId: string;
  readonly metadataDurationNs: number | undefined;
  readonly looker: VideoLooker | null;
  readonly showTags: boolean;
}) {
  // The recorded duration when the sample has one; otherwise the looker's,
  // read off the file header the poster already fetched
  const lookerDuration = useLookerDuration(looker);
  const durationNs =
    metadataDurationNs ??
    (lookerDuration !== null && lookerDuration > 0
      ? lookerDuration * NS_PER_SECOND
      : undefined);
  const ctx = useMemo<IntervalTileContext>(
    () => ({
      dataset: { datasetId },
      sample: { sample: { _id: sampleId } },
      surface: "grid",
      durationNs,
    }),
    [datasetId, sampleId, durationNs],
  );
  useScrubToFirstMatch(looker, ctx, lookerDuration !== null);

  const overlays = useMcapGridOverlays();
  return (
    <>
      {showTags ? <EpisodeGridOverlay ctx={ctx} /> : null}
      {overlays.map((Overlay) => (
        <Overlay key={mcapGridOverlayKey(Overlay)} ctx={ctx} />
      ))}
    </>
  );
}

export function useTileIntervalOverlay() {
  // `datasetId`, not `id`: the tag routes are keyed by the dataset's own id,
  // which is what the multimodal tile passes through its renderer context.
  const datasetId = fos.useCurrentDataset()?.datasetId;
  const RecoilBridge = useRecoilBridgeAcrossReactRoots_UNSTABLE();
  // Something can be drawn only where the dataset can carry temporal tags or
  // an edition registered a lane of its own, so nothing is mounted elsewhere.
  const supported = useRecoilValue(fos.supportsTemporalTags(false));
  const hasOverlays = useMcapGridOverlays().length > 0;

  const mounted = useRef(new Map<string, MountedOverlay>());

  const unmount = useCallback((key: string) => {
    const entry = mounted.current.get(key);
    if (!entry) {
      return;
    }

    mounted.current.delete(key);
    // Deferred: `unmount` is reached from spotlight's render path, and React
    // refuses to tear a root down while another is rendering.
    queueMicrotask(() => {
      entry.root.unmount();
      entry.host.remove();
    });
  }, []);

  const mount = useCallback(
    (
      key: string,
      element: HTMLElement,
      sample: TileSample,
      looker?: unknown,
    ) => {
      if ((!supported && !hasOverlays) || !datasetId) {
        return;
      }

      const mediaType = sample.sample?._media_type ?? sample.sample?.media_type;
      if (mediaType !== MEDIA_TYPE_VIDEO) {
        return;
      }

      const sampleId = sample.sample?._id;
      if (!sampleId) {
        return;
      }

      // Reattaching a cached looker calls through here again; the existing
      // root is bound to an element spotlight may have already reused.
      unmount(key);

      // `EpisodeGridOverlay` measures its tile with
      // `closest("[data-grid-tile]")`, which only the custom-renderer tile sets
      // on itself.
      element.setAttribute("data-grid-tile", "");

      const host = document.createElement("div");
      Object.assign(host.style, HOST_STYLES);
      element.appendChild(host);

      const root = createRoot(host);
      // Seconds on the sample's metadata; the lane's axis is nanoseconds, the
      // unit the tags themselves are stored in.
      const duration = sample.sample?.metadata?.duration;
      const durationNs =
        typeof duration === "number" && duration > 0
          ? duration * NS_PER_SECOND
          : undefined;

      root.render(
        <RecoilBridge>
          <VideoTileLanes
            datasetId={datasetId}
            sampleId={sampleId}
            metadataDurationNs={durationNs}
            looker={looker instanceof VideoLooker ? looker : null}
            showTags={supported}
          />
        </RecoilBridge>,
      );

      mounted.current.set(key, { root, host });
    },
    [RecoilBridge, datasetId, hasOverlays, supported, unmount],
  );

  // Tear every root down with the grid, so a dataset change does not leave
  // roots bound to elements spotlight has dropped.
  const mountedRef = mounted;
  useEffect(() => {
    return () => {
      const entries = [...mountedRef.current.values()];
      mountedRef.current.clear();
      queueMicrotask(() => {
        for (const { root, host } of entries) {
          root.unmount();
          host.remove();
        }
      });
    };
  }, [mountedRef]);

  return { mount, unmount };
}

export default useTileIntervalOverlay;
