import type { ImageAnnotationText } from "../../decoders";

type Point2 = readonly [number, number];

/**
 * A flat list of LINE_LIST segments partitioned by their associated label.
 * The label is `null` when the annotation message carries no per-object text.
 */
export interface LabeledSegmentGroup {
  readonly label: string | null;
  readonly segments: [Point2, Point2][];
}

/**
 * Splits a LINE_LIST annotation into per-label segment groups.
 *
 * Each annotation message encodes N objects with cuboid edges and labels
 * paired by index: `points` is `N * segmentsPerObject * 2` long and
 * `texts` has length N. The Nth chunk of segments is labeled by the Nth
 * text. Falls back to one unlabeled group when the counts don't divide
 * cleanly (other producers may encode differently).
 */
export function groupLineSegmentsByLabel(
  points: readonly Point2[],
  texts: readonly ImageAnnotationText[]
): readonly LabeledSegmentGroup[] {
  const segmentCount = Math.floor(points.length / 2);
  if (segmentCount === 0) return [];
  if (texts.length === 0 || segmentCount % texts.length !== 0) {
    const segments: [Point2, Point2][] = [];
    for (let i = 0; i < segmentCount; i++) {
      segments.push([points[i * 2], points[i * 2 + 1]]);
    }
    return [{ label: null, segments }];
  }
  const segmentsPerObject = segmentCount / texts.length;
  const groups: LabeledSegmentGroup[] = [];
  for (let i = 0; i < texts.length; i++) {
    const segments: [Point2, Point2][] = [];
    const start = i * segmentsPerObject;
    for (let j = 0; j < segmentsPerObject; j++) {
      const seg = start + j;
      segments.push([points[seg * 2], points[seg * 2 + 1]]);
    }
    groups.push({ label: texts[i]?.text || null, segments });
  }
  return groups;
}
