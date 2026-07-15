/**
 * looker-3d label-kind adapters: per-kind translation between committed labels
 * and the 3D annotation working store. The working store is this surface's
 * retained "scene" (cf. Scene2D for Lighter): a {@link Looker3dHandle} is a
 * store-bound view of one entry, since working entries are immutable store
 * values rather than live mutable objects.
 *
 * `buildHandle` is pure (descriptor only — the reconciled label minus its
 * coloring-scheme `color`, which the bridge stamps at mount); `updateHandle`
 * applies silently (a merge-write into the store); `toLabel` extracts the
 * persistable partial WITHOUT `_id` (the ref owns identity), reusing the
 * shared `build3dLabel` serializer.
 */

import type {
  ReconciledDetection3D,
  ReconciledPolyline3D,
} from "@fiftyone/looker-3d";
import type { LabelData } from "@fiftyone/utilities";
import { LabelType } from "@fiftyone/utilities";

import { build3dLabel } from "../../../state/build3dLabel";
import type { AdapterMap, LabelKindAdapter } from "../../bridge/types";

/** A working-store entry: a reconciled 3D detection or polyline. */
export type Working3dLabel = ReconciledDetection3D | ReconciledPolyline3D;

/**
 * Construction spec: the reconciled label to seed into the working store,
 * carrying `_id = ref.instanceId`. `color` is left for the bridge to stamp
 * from the coloring scheme at mount.
 */
export interface Looker3dDescriptor {
  label: Working3dLabel;
}

/**
 * A store-bound handle: the surface-native object for one working-store entry.
 * `read` returns the latest committed value (or undefined once removed);
 * `apply` is a silent merge-write back into the store.
 */
export interface Looker3dHandle {
  readonly instanceId: string;
  readonly path: string;
  read(): Working3dLabel | undefined;
  apply(label: LabelData): void;
}

export type Looker3dAdapter = LabelKindAdapter<
  Looker3dHandle,
  Looker3dDescriptor
>;

/** Strip identity — the working store owns `_id = ref.instanceId`. */
const toPersistable = (handle: Looker3dHandle): Partial<LabelData> | null => {
  const entry = handle.read();
  if (!entry) {
    return null;
  }

  const data = build3dLabel(entry);
  if (!data) {
    return null;
  }

  const { _id: _ignored, ...rest } = data as Record<string, unknown>;
  return rest as Partial<LabelData>;
};

export const detection3dAdapter: Looker3dAdapter = {
  // a 3D box is what this surface draws — a 2D Detection (shared `_cls`,
  // `bounding_box` only) and box-less junk fall out of scope by failing the
  // location+dimensions requirement
  renders: (label) =>
    Array.isArray(label.location) &&
    (label.location as unknown[]).length === 3 &&
    Array.isArray(label.dimensions) &&
    (label.dimensions as unknown[]).length === 3,

  buildHandle: (ref, label) => ({
    label: {
      ...(label as unknown as ReconciledDetection3D),
      _id: ref.instanceId,
      _cls: "Detection",
      type: "Detection",
      path: ref.path,
      isNew: false,
    },
  }),

  updateHandle: (handle, label) => {
    handle.apply(label);
  },

  toLabel: toPersistable,
};

export const polyline3dAdapter: Looker3dAdapter = {
  // 3D vertices are what this surface draws — a 2D Polyline (shared `_cls`,
  // `points` only) fails the requirement
  renders: (label) =>
    Array.isArray(label.points3d) && (label.points3d as unknown[]).length > 0,

  buildHandle: (ref, label) => {
    const raw = label as Record<string, unknown>;
    return {
      label: {
        ...(label as unknown as ReconciledPolyline3D),
        _id: ref.instanceId,
        _cls: "Polyline",
        type: "Polyline",
        path: ref.path,
        isNew: false,
        closed: !!raw.closed,
        filled: !!raw.filled,
      },
    };
  },

  updateHandle: (handle, label) => {
    handle.apply(label);
  },

  toLabel: toPersistable,
};

/**
 * The full looker-3d adapter map. Single and list kinds share an adapter — the
 * engine routes by `getLabelType(ref.path)`, the working-entry shape is
 * identical. The shared `_cls` with 2D Detection/Polyline is disambiguated by
 * each adapter's `renders` (3D geometry vs 2D), so a Lighter bridge and this
 * bridge never both claim the same label.
 */
export const looker3dAdapters: AdapterMap<Looker3dHandle, Looker3dDescriptor> =
  {
    [LabelType.Detection]: detection3dAdapter,
    [LabelType.Detections]: detection3dAdapter,
    [LabelType.Polyline]: polyline3dAdapter,
    [LabelType.Polylines]: polyline3dAdapter,
  };
