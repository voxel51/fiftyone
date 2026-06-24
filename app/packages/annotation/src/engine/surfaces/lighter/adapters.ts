/**
 * Lighter label-kind adapters: per-kind translation between
 * committed labels and Lighter overlays. `buildHandle` is pure (descriptor
 * only); `updateHandle` applies silently (`applyLabel`); `toLabel`
 * extracts the persistable partial WITHOUT `_id` (the ref owns identity).
 *
 * Handles are typed as `BaseOverlay` and narrowed per adapter — the engine
 * dispatches by the ref's label kind, so the concrete overlay class is
 * guaranteed by construction (no instanceof ladder).
 *
 * The extraction logic transplants the proven `buildOverlayLabel` per-kind
 * branches from `state/useSyncLighterSample.ts`; that path retires when the
 * Lighter surface migrates onto this bridge.
 */

import type {
  BaseOverlay,
  DetectionOverlay,
  DetectionOverlayOptions,
  KeypointLabel,
  PolylineOverlay,
} from "@fiftyone/lighter";
import { decodeMaskPath } from "@fiftyone/lighter";
import type { DetectionLabel } from "@fiftyone/looker";
import type { LabelData } from "@fiftyone/utilities";
import { DETECTION, hasValidBounds, LabelType } from "@fiftyone/utilities";

import type { AdapterMap, LabelKindAdapter } from "../../bridge/types";

/**
 * Construction spec shared by every Lighter adapter: the factory key plus the
 * factory options (always carrying `id = ref.instanceId`, which is what
 * mechanically enforces `overlay.id === instanceId`).
 */
export interface LighterDescriptor {
  factoryKey: "detection" | "classification" | "polyline" | "keypoint";
  options: { id: string; field: string; label: LabelData } & Record<
    string,
    unknown
  >;

  /**
   * Set when a faithful overlay needs an async source resolved before it can
   * mount (e.g. a `mask_path` that must be fetched + decoded). The bridge gates
   * the mount, runs it with an abort `signal`, merges the returned options into
   * the factory spec, then inserts — never a partially-hydrated intermediate.
   * The signal is aborted when a newer mount for the same overlay supersedes
   * this one (the adapter forwards it to `fetch`/decode to cancel the work).
   *
   * Kind-agnostic: the bridge never learns what the source is. The adapter owns
   * the decode and closes over its own media-URL resolver (via
   * {@link createLighterAdapters}); the bridge supplies only the signal.
   */
  deferred?: (
    signal: AbortSignal
  ) => Promise<Record<string, unknown> | undefined>;
}

/** Maps a raw media sub-field value (e.g. `mask_path`) to a fetchable URL. */
export type ResolveMediaUrl = (args: {
  path: string;
  instanceId: string;
  subField: string;
  raw: string;
}) => string | undefined;

export type LighterAdapter = LabelKindAdapter<BaseOverlay, LighterDescriptor>;

const toRect = (boundingBox: number[]) => ({
  x: boundingBox[0],
  y: boundingBox[1],
  width: boundingBox[2],
  height: boundingBox[3],
});

/** Strip identity — the store stamps `_id = ref.instanceId` on write. */
const withoutId = (label: Record<string, unknown>): Partial<LabelData> => {
  const { _id, ...rest } = label;
  return rest;
};

/**
 * Detection adapter factory: closes over the modal-wiring `resolveMediaUrl` so
 * the deferred mask decode is entirely the adapter's concern — the bridge
 * supplies only an abort signal.
 */
export const makeDetectionAdapter = (
  resolveMediaUrl?: ResolveMediaUrl
): LighterAdapter => ({
  // a 2D box is what this surface draws — Detection3D (shared `_cls`) and
  // box-less junk fall out of scope by failing the requirement
  renders: (label) =>
    Array.isArray(label.bounding_box) && label.bounding_box.length === 4,

  buildHandle: (ref, label) => ({
    factoryKey: "detection",
    ...(!label.mask && typeof label.mask_path === "string"
      ? {
          // The mask decode is the adapter's concern, not the bridge's.
          deferred: async (signal: AbortSignal) => {
            const url = resolveMediaUrl?.({
              path: ref.path,
              instanceId: ref.instanceId,
              subField: "mask_path",
              raw: label.mask_path as string,
            });

            if (!url) {
              console.warn(
                `[mask-path] detection ${ref.instanceId} in field ` +
                  `"${ref.path}" has mask_path but no resolvable URL; ` +
                  "mounting without its mask"
              );
              return undefined;
            }

            if (signal.aborted) return undefined;

            const mask = await decodeMaskPath(url, ref.path, DETECTION);
            return signal.aborted || !mask
              ? undefined
              : { preDecodedMask: mask };
          },
        }
      : {}),
    options: {
      id: ref.instanceId,
      field: ref.path,
      label: label as unknown as DetectionOverlayOptions["label"],
      relativeBounds: toRect(label.bounding_box as number[]),
      draggable: true,
      resizeable: true,
      selectable: true,
    },
  }),

  updateHandle: (overlay, label) => {
    overlay.applyLabel(label as unknown as DetectionLabel);
  },

  toLabel: (handle) => {
    const overlay = handle as DetectionOverlay;
    const bounds = overlay.relativeBounds;
    const boundingBox: [number, number, number, number] = [
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
    ];

    if (!hasValidBounds(boundingBox)) {
      return null;
    }

    // Mask channel: persist a pending (freshly painted) mask inline; null out
    // mask/mask_path when the mask was removed so the diff overrides the
    // stored value.
    const {
      _id: _ignored,
      mask: priorMask,
      mask_path: priorMaskPath,
      ...data
    } = overlay.label as Record<string, unknown>;
    const pendingMask = overlay.getPendingMask();
    const hadMask = priorMask || priorMaskPath;

    const maskData = overlay.hasMask()
      ? {
          ...(priorMask ? { mask: priorMask } : {}),
          ...(pendingMask ? { mask: pendingMask } : {}),
          ...(pendingMask && priorMaskPath ? { mask_path: null } : {}),
        }
      : hadMask
      ? { mask: null, mask_path: null }
      : {};

    return { ...data, ...maskData, bounding_box: boundingBox };
  },
});

export const classificationAdapter: LighterAdapter = {
  buildHandle: (ref, label) => ({
    factoryKey: "classification",
    options: { id: ref.instanceId, field: ref.path, label },
  }),

  updateHandle: (overlay, label) => {
    overlay.applyLabel(label as Parameters<BaseOverlay["applyLabel"]>[0]);
  },

  toLabel: (overlay) => withoutId(overlay.label as Record<string, unknown>),
};

export const keypointAdapter: LighterAdapter = {
  buildHandle: (ref, label) => ({
    factoryKey: "keypoint",
    options: { id: ref.instanceId, field: ref.path, label },
  }),

  updateHandle: (overlay, label) => {
    overlay.applyLabel(label as unknown as KeypointLabel);
  },

  toLabel: (overlay) => withoutId(overlay.label as Record<string, unknown>),
};

export const polylineAdapter: LighterAdapter = {
  // 2D vertices are what this surface draws — Polyline3D (shared `_cls`,
  // `points3d` only) fails the requirement
  renders: (label) =>
    Array.isArray(label.points) && (label.points as unknown[]).length > 0,

  buildHandle: (ref, label) => ({
    factoryKey: "polyline",
    options: { id: ref.instanceId, field: ref.path, label },
  }),

  updateHandle: (overlay, label) => {
    overlay.applyLabel(label as Parameters<BaseOverlay["applyLabel"]>[0]);
  },

  toLabel: (handle) => {
    const overlay = handle as PolylineOverlay;
    const label = withoutId(overlay.label as Record<string, unknown>);

    return {
      ...label,
      points: overlay.getNestedPoints(),
      closed: overlay.getClosed(),
      filled: overlay.getFilled(),
    };
  },
};

/**
 * The full Lighter adapter map. Single and list kinds share an adapter — the
 * engine routes by `getLabelType(ref.path)`, the overlay shape is identical.
 */
export const createLighterAdapters = ({
  resolveMediaUrl,
}: {
  resolveMediaUrl?: ResolveMediaUrl;
}): AdapterMap<BaseOverlay, LighterDescriptor> => {
  const detection = makeDetectionAdapter(resolveMediaUrl);
  return {
    [LabelType.Detection]: detection,
    [LabelType.Detections]: detection,
    [LabelType.Classification]: classificationAdapter,
    [LabelType.Classifications]: classificationAdapter,
    [LabelType.Keypoint]: keypointAdapter,
    [LabelType.Keypoints]: keypointAdapter,
    [LabelType.Polyline]: polylineAdapter,
    [LabelType.Polylines]: polylineAdapter,
  };
};
