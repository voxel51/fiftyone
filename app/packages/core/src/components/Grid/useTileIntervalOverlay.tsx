import { EpisodeGridOverlay } from "@fiftyone/multimodal/grid-overlay";
import * as fos from "@fiftyone/state";
import { MEDIA_TYPE_VIDEO } from "@fiftyone/utilities";
import { useCallback, useEffect, useRef } from "react";
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

export function useTileIntervalOverlay() {
  // `datasetId`, not `id`: the tag routes are keyed by the dataset's own id,
  // which is what the multimodal tile passes through its renderer context.
  const datasetId = fos.useCurrentDataset()?.datasetId;
  const RecoilBridge = useRecoilBridgeAcrossReactRoots_UNSTABLE();
  // The lane only ever has something to draw where the dataset can carry
  // temporal tags, so nothing is mounted anywhere else.
  const supported = useRecoilValue(fos.supportsTemporalTags(false));

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
    (key: string, element: HTMLElement, sample: TileSample) => {
      if (!supported || !datasetId) {
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
          <EpisodeGridOverlay
            ctx={{
              dataset: { datasetId },
              sample: { sample: { _id: sampleId } },
              surface: "grid",
              durationNs,
            }}
          />
        </RecoilBridge>,
      );

      mounted.current.set(key, { root, host });
    },
    [RecoilBridge, datasetId, supported, unmount],
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
