/**
 * Overlay host for tiles the grid renders with the default looker. The looker
 * paints into a bare element, so the lanes get their own React root on it,
 * torn down when spotlight recycles the element.
 */
import { VideoLooker } from "@fiftyone/looker";
import {
  useGridOverlays,
  useSampleRendererFirstMatch,
} from "@fiftyone/multimodal/extensions/timeline";
import type { IntervalTileContext } from "@fiftyone/multimodal/extensions/episode-intervals";
import {
  getEpisodeSeek,
  publishEpisodeTimeRange,
  releaseEpisodeSeek,
  subscribeEpisodeSeek,
  TileLanes,
} from "@fiftyone/multimodal/grid-overlay";
import * as fos from "@fiftyone/state";
import { MEDIA_TYPE_VIDEO } from "@fiftyone/utilities";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import {
  useRecoilBridgeAcrossReactRoots_UNSTABLE,
  useRecoilValue,
} from "recoil";

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

/** Grid samples arrive from Relay with a scalar payload typed as `object`. */
type TileSample = { readonly sample?: object };

const NS_PER_SECOND = 1_000_000_000;

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
  // Known once the poster has loaded
  const [lookerDuration, setLookerDuration] = useState(
    () => looker?.duration ?? null,
  );
  useEffect(() => {
    if (!looker) return undefined;
    const read = () => setLookerDuration(looker.duration ?? null);
    read();
    looker.addEventListener("load", read);
    return () => looker.removeEventListener("load", read);
  }, [looker]);

  const durationNs =
    metadataDurationNs ??
    (lookerDuration !== null && lookerDuration > 0
      ? lookerDuration * NS_PER_SECOND
      : undefined);
  // Before paint, so no lane is first drawn against its intervals' extent
  useLayoutEffect(() => {
    if (durationNs === undefined) return;
    publishEpisodeTimeRange(sampleId, {
      startNs: 0n,
      endNs: BigInt(Math.round(durationNs)),
    });
  }, [sampleId, durationNs]);
  const ctx = useMemo<IntervalTileContext>(
    () => ({
      dataset: { datasetId },
      sample: { sample: { _id: sampleId } },
      surface: "grid",
    }),
    [datasetId, sampleId],
  );

  const startNs = useSampleRendererFirstMatch(ctx)?.startNs ?? null;
  const loaded = lookerDuration !== null;
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

  useEffect(() => {
    if (!looker) return undefined;
    const unsubscribe = subscribeEpisodeSeek(sampleId, () => {
      const request = getEpisodeSeek(sampleId);
      if (request)
        looker.seekToSeconds(Number(request.timestampNs) / NS_PER_SECOND);
    });
    return () => {
      unsubscribe();
      releaseEpisodeSeek(sampleId);
    };
  }, [looker, sampleId]);

  return <TileLanes ctx={ctx} showTags={showTags} />;
}

export function useTileIntervalOverlay() {
  // `datasetId`, not `id`: the tag routes are keyed by the dataset's own id,
  // which is what the multimodal tile passes through its renderer context.
  const datasetId = fos.useCurrentDataset()?.datasetId;
  const RecoilBridge = useRecoilBridgeAcrossReactRoots_UNSTABLE();
  const supported = useRecoilValue(fos.supportsTemporalTags(false));
  const hasOverlays = useGridOverlays().length > 0;

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

      const data = sample.sample as
        | {
            readonly _id?: string;
            readonly media_type?: string | null;
            readonly _media_type?: string | null;
            readonly metadata?: { readonly duration?: number | null } | null;
          }
        | undefined;
      const mediaType = data?._media_type ?? data?.media_type;
      if (mediaType !== MEDIA_TYPE_VIDEO) {
        return;
      }

      const sampleId = data?._id;
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
      const duration = data?.metadata?.duration;
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

  useEffect(() => {
    const current = mounted.current;
    return () => {
      const entries = [...current.values()];
      current.clear();
      queueMicrotask(() => {
        for (const { root, host } of entries) {
          root.unmount();
          host.remove();
        }
      });
    };
  }, []);

  return { mount, unmount };
}

export default useTileIntervalOverlay;
