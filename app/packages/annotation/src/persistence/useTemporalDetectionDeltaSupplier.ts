import type { JSONDeltas } from "@fiftyone/core/src/client";
import {
  TemporalOverlay,
  useLighter,
  type TemporalLabel,
} from "@fiftyone/lighter";
import { fieldPaths, useIsVideo, useModalSample } from "@fiftyone/state";
import {
  EMBEDDED_DOCUMENT_FIELD,
  TEMPORAL_DETECTIONS_FIELD,
} from "@fiftyone/utilities";
import { isEqual } from "lodash";
import { useCallback, useEffect } from "react";
import { useRecoilValue } from "recoil";
import type { DeltaSupplier } from "./deltaSupplier";
import {
  useResetTemporalDetectionTombstones,
  useTemporalDetectionTombstones,
  type TemporalDetectionTombstone,
} from "./temporalDetectionTombstones";

/**
 * Persistence path for `TemporalDetection` edits. The Lighter `TemporalOverlay`
 * is the source of truth — edits from the sidebar (`Support` component + the
 * generic `AnnotationSchema` form for label/confidence/attributes) and from
 * the timeline drag all flow through `overlay.updateLabel`. This supplier
 * walks the scene's TD overlays at autosave time and diffs each against the
 * server-side baseline (`modalSample.sample[field].detections[i]` matched by
 * `_id`) to emit JSON-Patch ops.
 *
 * Mirrors the role `useLighterDeltaSupplier` plays for image overlays;
 * lives in a separate hook because the lighter supplier short-circuits on
 * video samples to avoid double-counting per-frame Detection overlays.
 */
export const useTemporalDetectionDeltaSupplier = (): DeltaSupplier => {
  const { scene } = useLighter();
  const modalSample = useModalSample();
  const isVideo = useIsVideo();

  // Sample-level fields the schema declares as TemporalDetections
  const declaredTdFields = useRecoilValue(
    fieldPaths({
      ftype: EMBEDDED_DOCUMENT_FIELD,
      embeddedDocType: TEMPORAL_DETECTIONS_FIELD,
    })
  );

  const tombstones = useTemporalDetectionTombstones();
  const resetTombstones = useResetTemporalDetectionTombstones();

  // Tombstones are per-sample: drop them when the modal sample changes so a
  // deletion recorded on one sample can never resolve against another's
  // baseline.
  const sampleId = (modalSample?.sample as { _id?: string } | undefined)?._id;
  useEffect(() => {
    resetTombstones();
  }, [sampleId, resetTombstones]);

  return useCallback(() => {
    if (!isVideo || !scene || !modalSample?.sample) {
      return { deltas: [], metadata: undefined };
    }

    const overlays = scene
      .getAllOverlays()
      .filter((o): o is TemporalOverlay => o instanceof TemporalOverlay);

    return {
      deltas: buildTemporalDetectionOverlayDeltas(
        modalSample.sample as Record<string, unknown>,
        overlays,
        tombstones,
        declaredTdFields
      ),
      metadata: undefined,
    };
  }, [isVideo, modalSample, scene, declaredTdFields, tombstones]);
};

/**
 * Walk TD overlays grouped by field path, diff against the matching
 * sample baseline, and emit JSON-Patch ops. Exported for direct unit
 * testing.
 *
 * - **Adds / updates** come from scene overlays: an overlay with no
 *   baseline entry is an `add /-`, one that matches is diffed in place.
 *   Only fields that actually have overlays are walked.
 * - **Removals** come from explicit `tombstones` — TDs the user deleted —
 *   resolved to the current baseline index by `_id`. A tombstone whose id
 *   is no longer in the baseline (already persisted + refetched, or never
 *   present) is skipped, so a `remove` is emitted at most once per
 *   deletion and never against an index-shifted array.
 *
 * `declaredFields` are the sample-level field paths the dataset schema
 * declares as `TemporalDetections`.
 */
export function buildTemporalDetectionOverlayDeltas(
  sample: Record<string, unknown>,
  overlays: readonly TemporalOverlay[],
  tombstones: readonly TemporalDetectionTombstone[] = [],
  declaredFields?: readonly string[]
): JSONDeltas {
  const deltas: JSONDeltas = [];

  const findById = (detections: readonly unknown[], id: string): number =>
    detections.findIndex(
      (d) =>
        (d as { _id?: string; id?: string })._id === id ||
        (d as { _id?: string; id?: string }).id === id
    );

  // field path -> set of tombstoned detection ids
  const tombstonedByField = new Map<string, Set<string>>();
  for (const { field, id } of tombstones) {
    const ids = tombstonedByField.get(field) ?? new Set<string>();
    ids.add(id);
    tombstonedByField.set(field, ids);
  }

  const byField = new Map<string, TemporalOverlay[]>();
  for (const overlay of overlays) {
    const list = byField.get(overlay.field) ?? [];
    list.push(overlay);
    byField.set(overlay.field, list);
  }

  // Adds / updates from scene overlays.
  for (const [fieldPath, fieldOverlays] of byField) {
    const field = sample[fieldPath] as
      | { _cls?: string; detections?: unknown }
      | undefined;
    const isPopulated = !!field && field._cls === "TemporalDetections";
    const isDeclared = declaredFields?.includes(fieldPath) ?? false;
    if (!isPopulated && !isDeclared) {
      // Neither populated as a TemporalDetections wrapper nor a known
      // schema field — emitting `add /-` here would target a path the
      // server can't materialize, so skip.
      continue;
    }
    // Declared-but-unpopulated → no baseline; every overlay is a create.
    const baseline =
      isPopulated && Array.isArray(field.detections) ? field.detections : [];

    for (const overlay of fieldOverlays) {
      const label = overlay.label;
      const id = label?._id;
      if (!id) {
        continue;
      }

      // A tombstoned overlay still lingering in the scene must not emit an
      // add/update that fights its pending removal.
      if (tombstonedByField.get(fieldPath)?.has(id)) {
        continue;
      }

      const index = findById(baseline, id);
      if (index < 0) {
        // New TD — append the full doc.
        const value = serializeOverlayLabel(label);
        if (!value) continue;
        deltas.push({
          op: "add",
          path: `/${fieldPath}/detections/-`,
          value,
        });
        continue;
      }

      const base = baseline[index] as Record<string, unknown>;
      diffOverlayLabel(
        label,
        base,
        `/${fieldPath}/detections/${index}`,
        deltas
      );
    }
  }

  // Removals from explicit tombstones, resolved to the current baseline
  // index by `_id`. Descending per field so each `remove` doesn't shift the
  // indices of the ones still to come.
  const removalsByField = new Map<string, number[]>();
  for (const { field: fieldPath, id } of tombstones) {
    const field = sample[fieldPath] as
      | { _cls?: string; detections?: unknown }
      | undefined;

    if (!field || field._cls !== "TemporalDetections") {
      continue;
    }

    if (!Array.isArray(field.detections)) {
      continue;
    }

    const index = findById(field.detections, id);
    if (index < 0) {
      continue;
    }

    const list = removalsByField.get(fieldPath) ?? [];
    list.push(index);
    removalsByField.set(fieldPath, list);
  }

  for (const [fieldPath, indices] of removalsByField) {
    indices.sort((a, b) => b - a);
    for (const index of indices) {
      deltas.push({ op: "remove", path: `/${fieldPath}/detections/${index}` });
    }
  }

  return deltas;
}

const RESERVED_LABEL_KEYS = new Set([
  "_cls",
  "_id",
  "id",
  "support",
  "label",
  "confidence",
]);

/**
 * Built-in label fields the server always materializes (a `TemporalDetection`
 * gets `tags: []` by default) but a freshly-created overlay doesn't carry. The
 * "baseline key not on overlay → remove" rule must skip these: a new TD has no
 * `tags`, so it would emit `remove /tags` on every tick, the server re-defaults
 * `tags: []` on the next refetch, and the diff never converges — an infinite
 * save loop. Edits still persist via the add/replace path (a hydrated overlay
 * carries `tags`, compared with `isEqual`).
 */
const SERVER_DEFAULT_LABEL_KEYS = new Set(["tags"]);

function serializeOverlayLabel(
  label: TemporalLabel | null | undefined
): Record<string, unknown> | null {
  if (!label?._id) return null;
  if (!Array.isArray(label.support) || label.support.length !== 2) return null;
  const out: Record<string, unknown> = {
    _cls: "TemporalDetection",
    _id: label._id,
    support: [label.support[0], label.support[1]],
  };
  if (label.label !== undefined) out.label = label.label;
  if (label.confidence !== undefined) out.confidence = label.confidence;
  for (const [k, v] of Object.entries(label)) {
    if (RESERVED_LABEL_KEYS.has(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function diffOverlayLabel(
  overlayLabel: TemporalLabel,
  baseline: Record<string, unknown>,
  basePath: string,
  deltas: JSONDeltas
): void {
  const support = overlayLabel.support;
  const baseSupport = baseline.support as [number, number] | undefined;
  const supportChanged =
    Array.isArray(support) &&
    support.length === 2 &&
    (!Array.isArray(baseSupport) ||
      baseSupport[0] !== support[0] ||
      baseSupport[1] !== support[1]);
  if (supportChanged) {
    deltas.push({
      op: "support" in baseline ? "replace" : "add",
      path: `${basePath}/support`,
      value: [support[0], support[1]],
    });
  }

  if (
    overlayLabel.label !== undefined &&
    overlayLabel.label !== baseline.label
  ) {
    deltas.push({
      op: "label" in baseline ? "replace" : "add",
      path: `${basePath}/label`,
      value: overlayLabel.label,
    });
  }

  if (
    overlayLabel.confidence !== undefined &&
    overlayLabel.confidence !== baseline.confidence
  ) {
    deltas.push({
      op: "confidence" in baseline ? "replace" : "add",
      path: `${basePath}/confidence`,
      value: overlayLabel.confidence,
    });
  }

  // Dynamic / user-defined attributes: anything on the overlay label that's
  // not a reserved structural key.
  for (const [k, v] of Object.entries(overlayLabel)) {
    if (RESERVED_LABEL_KEYS.has(k)) continue;
    if (v === undefined) {
      if (k in baseline) {
        deltas.push({ op: "remove", path: `${basePath}/${k}` });
      }
      continue;
    }

    if (!isEqual(v, baseline[k])) {
      deltas.push({
        op: k in baseline ? "replace" : "add",
        path: `${basePath}/${k}`,
        value: v as unknown,
      });
    }
  }

  // Detect removals: keys on the baseline that aren't on the overlay.
  for (const k of Object.keys(baseline)) {
    if (RESERVED_LABEL_KEYS.has(k)) continue;
    // Server-default fields (e.g. `tags`) are always on the baseline but
    // absent from a freshly-created overlay — removing them loops forever.
    if (SERVER_DEFAULT_LABEL_KEYS.has(k)) continue;
    if (!(k in overlayLabel)) {
      deltas.push({ op: "remove", path: `${basePath}/${k}` });
    }
  }
}
