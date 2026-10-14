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
  KeypointOverlay,
  PolylineOverlay,
} from "@fiftyone/lighter";
import type { DetectionLabel, KeypointSkeleton } from "@fiftyone/looker";
import type { LabelData } from "@fiftyone/utilities";
import { hasValidBounds, LabelType } from "@fiftyone/utilities";

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
   * Raw `mask_path` value needing an async decode before a faithful overlay
   * exists. The bridge gates the mount on it — never a
   * maskless intermediate. Set by the detection adapter when the label has
   * `mask_path` but no inline `mask`.
   */
  pendingMaskPath?: string;
}

export type LighterAdapter = LabelKindAdapter<BaseOverlay, LighterDescriptor>;

/**
 * App state the Lighter adapters need but the engine must not reach for
 * itself — injected by the surface hook, which owns the React binding.
 */
export interface LighterAdapterDeps {
  /** Resolves the keypoint skeleton for a label path (e.g. `frames.keypoints`). */
  getSkeleton?: (field: string) => KeypointSkeleton | null;
}

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

export const detectionAdapter: LighterAdapter = {
  // a 2D box is what this surface draws — Detection3D (shared `_cls`) and
  // box-less junk fall out of scope by failing the requirement
  renders: (label) =>
    Array.isArray(label.bounding_box) && label.bounding_box.length === 4,

  buildHandle: (ref, label) => ({
    factoryKey: "detection",
    ...(!label.mask && typeof label.mask_path === "string"
      ? { pendingMaskPath: label.mask_path }
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

    // Rotation channel: the overlay owns the live scalar rotation for 2D
    // boxes. Persist it when the gesture set one, or when the stored label
    // already carried a scalar (so rotating back to exactly 0 overwrites the
    // stale value). A 3D `[x, y, z]` rotation list flows through `data`
    // untouched — the overlay reports 0 for it. Optional-called: handles are
    // duck-typed at this boundary (tests supply plain stubs).
    //
    // Masked overlays skip the channel entirely: `getRotation()` suppresses
    // rotation for RENDERING when a mask is present, and writing that 0 here
    // would destroy a stored scalar — the stored value flows through `data`
    // instead.
    const rotation = overlay.getRotation?.() ?? 0;
    const rotationData =
      !overlay.hasMask() &&
      (rotation !== 0 || typeof data.rotation === "number")
        ? { rotation }
        : {};

    return { ...data, ...maskData, ...rotationData, bounding_box: boundingBox };
  },
};

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

/**
 * Skeleton edges are what make a keypoint label draw as a figure rather than a
 * cloud of dots: each edge path is a list of indices into `label.points`, which
 * is exactly Lighter's `connections` shape. The resolver is injected (the
 * engine stays free of app state) — omit it and keypoints render unconnected,
 * which is right for a dataset with no skeleton.
 */
export const makeKeypointAdapter = (
  deps: LighterAdapterDeps = {},
): LighterAdapter => ({
  buildHandle: (ref, label) => {
    const skeleton = deps.getSkeleton?.(ref.path) ?? null;

    return {
      factoryKey: "keypoint",
      options: {
        id: ref.instanceId,
        field: ref.path,
        label,
        connections: skeleton?.edges ?? [],
        closed: false,
        draggable: true,
        // Skeleton nodes are cleared back to [NaN, NaN] holes, never
        // deleted — a node's index is its identity
        deletable: !skeleton,
        selectable: true,
      },
    };
  },

  updateHandle: (overlay, label) => {
    overlay.applyLabel(label as unknown as KeypointLabel);
  },

  toLabel: (handle) => {
    const overlay = handle as KeypointOverlay;
    const label = withoutId(overlay.label as Record<string, unknown>);

    // Live geometry — `overlay.label.points` is a snapshot from creation /
    // last reconciliation (cf. polylineAdapter). Holes persist as [NaN, NaN].
    return { ...label, points: overlay.getRelativePoints() };
  },
});

/** Skeleton-less keypoint adapter — points render unconnected. */
export const keypointAdapter: LighterAdapter = makeKeypointAdapter();

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
 * Builds the full Lighter adapter map. Single and list kinds share an adapter —
 * the engine routes by `getLabelType(ref.path)`, the overlay shape is
 * identical. Only the keypoint adapter reads `deps`; the rest are constants.
 *
 * The result MUST be memoized by the caller: a new identity re-registers the
 * bridge loop.
 */
export const makeLighterAdapters = (
  deps: LighterAdapterDeps = {},
): AdapterMap<BaseOverlay, LighterDescriptor> => ({
  [LabelType.Detection]: detectionAdapter,
  [LabelType.Detections]: detectionAdapter,
  [LabelType.Classification]: classificationAdapter,
  [LabelType.Classifications]: classificationAdapter,
  [LabelType.Keypoint]: makeKeypointAdapter(deps),
  [LabelType.Keypoints]: makeKeypointAdapter(deps),
  [LabelType.Polyline]: polylineAdapter,
  [LabelType.Polylines]: polylineAdapter,
});

/** The dependency-free map — keypoints render unconnected. */
export const lighterAdapters: AdapterMap<BaseOverlay, LighterDescriptor> =
  makeLighterAdapters();
