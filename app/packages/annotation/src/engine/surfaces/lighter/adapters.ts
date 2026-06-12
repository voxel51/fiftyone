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
import type { DetectionLabel } from "@fiftyone/looker";
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

  /**
   * Data this 2D surface cannot represent — the bridge declines the mount.
   * The 3D twins (Detection3D/Polyline3D) share `_cls` with their 2D kinds,
   * so kind dispatch alone cannot exclude them; the adapters shape-check the
   * data. The 3D surface owns these labels.
   */
  unrenderable?: boolean;
}

export type LighterAdapter = LabelKindAdapter<BaseOverlay, LighterDescriptor>;

const toRect = (boundingBox: number[]) => ({
  x: boundingBox[0],
  y: boundingBox[1],
  width: boundingBox[2],
  height: boundingBox[3],
});

// shape checks mirroring looker-3d's isDetection3dOverlay/isPolyline3dOverlay
// (not imported — that would invert the package dependency)
const isDetection3d = (label: LabelData): boolean => {
  const data = label as Record<string, unknown>;
  return data.dimensions != null && data.location != null;
};

const isPolyline3d = (label: LabelData): boolean =>
  (label as Record<string, unknown>).points3d != null;

/** Strip identity — the store stamps `_id = ref.instanceId` on write. */
const withoutId = (label: Record<string, unknown>): Partial<LabelData> => {
  const { _id, ...rest } = label;
  return rest;
};

export const detectionAdapter: LighterAdapter = {
  buildHandle: (ref, label) => {
    if (isDetection3d(label) || !Array.isArray(label.bounding_box)) {
      return {
        factoryKey: "detection",
        unrenderable: true,
        options: { id: ref.instanceId, field: ref.path, label },
      };
    }

    return {
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
    };
  },

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
  buildHandle: (ref, label) => ({
    factoryKey: "polyline",
    ...(isPolyline3d(label) ? { unrenderable: true } : {}),
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
export const lighterAdapters: AdapterMap<BaseOverlay, LighterDescriptor> = {
  [LabelType.Detection]: detectionAdapter,
  [LabelType.Detections]: detectionAdapter,
  [LabelType.Classification]: classificationAdapter,
  [LabelType.Classifications]: classificationAdapter,
  [LabelType.Keypoint]: keypointAdapter,
  [LabelType.Keypoints]: keypointAdapter,
  [LabelType.Polyline]: polylineAdapter,
  [LabelType.Polylines]: polylineAdapter,
};
