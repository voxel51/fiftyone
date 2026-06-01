import type { JSONDeltas } from "@fiftyone/core/src/client";
import {
  TemporalOverlay,
  useLighter,
  type TemporalLabel,
} from "@fiftyone/lighter";
import { useIsVideo, useModalSample } from "@fiftyone/state";
import { useCallback } from "react";
import type { DeltaSupplier } from "./deltaSupplier";

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
        overlays
      ),
      metadata: undefined,
    };
  }, [isVideo, modalSample, scene]);
};

/**
 * Walk TD overlays grouped by field path, diff against the matching
 * sample baseline, and emit JSON-Patch ops. Overlays without a baseline
 * entry are emitted as `add /-`; baseline entries with no matching
 * overlay are emitted as `remove /N`. Exported for direct unit testing.
 */
export function buildTemporalDetectionOverlayDeltas(
  sample: Record<string, unknown>,
  overlays: readonly TemporalOverlay[]
): JSONDeltas {
  const deltas: JSONDeltas = [];

  const byField = new Map<string, TemporalOverlay[]>();
  for (const overlay of overlays) {
    const list = byField.get(overlay.field) ?? [];
    list.push(overlay);
    byField.set(overlay.field, list);
  }

  for (const [fieldPath, fieldOverlays] of byField) {
    const field = sample[fieldPath] as
      | { _cls?: string; detections?: unknown }
      | undefined;
    if (!field || field._cls !== "TemporalDetections") {
      // Field doesn't exist yet on the sample — every overlay is a
      // create. The patch's `add /-` only works once the parent list
      // exists; backend handles the initial materialization elsewhere,
      // so skip until then rather than emit ops the server can't apply.
      continue;
    }
    const baseline = Array.isArray(field.detections) ? field.detections : [];

    const seenIds = new Set<string>();
    for (const overlay of fieldOverlays) {
      const label = overlay.label;
      const id = label?._id;
      if (!id) continue;
      seenIds.add(id);

      const index = baseline.findIndex(
        (d) => (d as { _id?: string; id?: string })._id === id ||
          (d as { _id?: string; id?: string }).id === id
      );

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
      const basePath = `/${fieldPath}/detections/${index}`;
      diffOverlayLabel(label, base, basePath, deltas);
    }

    // Removals: baseline entries with no matching overlay
    for (let i = 0; i < baseline.length; i++) {
      const baseId = (baseline[i] as { _id?: string; id?: string })._id ?? (
        baseline[i] as { _id?: string; id?: string }
      ).id;
      if (baseId && !seenIds.has(baseId)) {
        deltas.push({ op: "remove", path: `/${fieldPath}/detections/${i}` });
      }
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
    if (v !== baseline[k]) {
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
    if (!(k in overlayLabel)) {
      deltas.push({ op: "remove", path: `${basePath}/${k}` });
    }
  }
}
