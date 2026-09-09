/**
 * What video Explore paints, in both namespaces:
 *
 * - per-frame: `frames.*` only, resolved against the frame schema and
 *   narrowed to the types the frame projection can actually seed;
 * - sample-level: the classification fields the sidebar has active;
 * - and the union of the two, which is the Lighter bridge's scope.
 *
 * The split matters. `bridgeLoop`'s `inScope` tests `paths.has(ref.path)`
 * against that union, so a namespace missing from it is filtered out before
 * hydration however plainly the sidebar has it checked — while the FrameStore's
 * own registration must stay frames-only, because a sample-level label belongs
 * to the composite store's `SampleLabelStore` half.
 */

import { LabelType } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";

import {
  toExploreFrameLabelFields,
  toExploreOverlayPaths,
  toExploreSampleClassificationPaths,
} from "./exploreFrameLabelFields";

const schema = (entries: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(entries).map(([path, cls]) => [
      path,
      { embeddedDocType: `fiftyone.core.labels.${cls}` },
    ]),
  );

describe("toExploreFrameLabelFields", () => {
  it("keys by the frames.-prefixed path and resolves the label type", () => {
    expect(
      toExploreFrameLabelFields(
        ["frames.detections"],
        schema({ detections: "Detections" }),
      ),
    ).toEqual({ "frames.detections": LabelType.Detections });
  });

  it("ignores sample-level active paths", () => {
    // The frame store owns the `frames.` namespace only; a sample-level field
    // registered here would be addressed against frame data that never has it.
    expect(
      toExploreFrameLabelFields(
        ["ground_truth", "predictions"],
        schema({ detections: "Detections" }),
      ),
    ).toEqual({});
  });

  it("admits every type the frame projection can paint", () => {
    // Keypoints and classifications regressed once: the sidebar listed them
    // active and nothing rendered, because the projection did not know them.
    expect(
      toExploreFrameLabelFields(
        [
          "frames.detections",
          "frames.polylines",
          "frames.keypoints",
          "frames.classifications",
        ],
        schema({
          detections: "Detections",
          polylines: "Polylines",
          keypoints: "Keypoints",
          classifications: "Classifications",
        }),
      ),
    ).toEqual({
      "frames.detections": LabelType.Detections,
      "frames.polylines": LabelType.Polylines,
      "frames.keypoints": LabelType.Keypoints,
      "frames.classifications": LabelType.Classifications,
    });
  });

  it("drops types the projection cannot seed", () => {
    // Better to omit than to register: a registered-but-unseeded field is
    // walked on every frame diff and still paints nothing.
    expect(
      toExploreFrameLabelFields(
        ["frames.segmentations", "frames.detections"],
        schema({
          segmentations: "Segmentation",
          detections: "Detections",
        }),
      ),
    ).toEqual({ "frames.detections": LabelType.Detections });
  });

  it("drops a path the frame schema does not describe", () => {
    expect(
      toExploreFrameLabelFields(["frames.detections"], schema({})),
    ).toEqual({});
  });

  it("tolerates a missing schema", () => {
    expect(toExploreFrameLabelFields(["frames.detections"], null)).toEqual({});
  });

  it("returns nothing when no field is active", () => {
    expect(
      toExploreFrameLabelFields([], schema({ detections: "Detections" })),
    ).toEqual({});
  });
});

describe("toExploreSampleClassificationPaths", () => {
  // The schema list comes from a `space: SAMPLE` query, so it is the authority
  // on which paths are sample-level classifications; the active list is the
  // authority on which the user wants to see.
  it("keeps a sample classification the sidebar has active", () => {
    expect([
      ...toExploreSampleClassificationPaths(
        ["cls", "frames.detections"],
        ["cls"],
      ),
    ]).toEqual(["cls"]);
  });

  it("keeps every active classification field, single and list alike", () => {
    expect([
      ...toExploreSampleClassificationPaths(
        ["cls", "predictions", "frames.detections"],
        ["cls", "predictions"],
      ),
    ]).toEqual(["cls", "predictions"]);
  });

  it("drops a classification field the sidebar has not activated", () => {
    // Visibility gates rendering: unchecking the field must clear its overlay.
    expect([
      ...toExploreSampleClassificationPaths(["frames.detections"], ["cls"]),
    ]).toEqual([]);
  });

  it("drops an active path the schema does not call a classification", () => {
    // Detections, temporal detections and primitives all reach `active`; only
    // the schema can say which of them this scope may claim. A TD in
    // particular must NOT appear — it renders through `useTemporalOverlaySync`
    // and has no Lighter adapter, so scoping it here would be a silent no-op
    // at best.
    expect([
      ...toExploreSampleClassificationPaths(
        ["detections", "events", "filepath"],
        ["cls"],
      ),
    ]).toEqual([]);
  });

  it("never claims a frame path, even one named in both lists", () => {
    // `frames.classifications` is the FrameStore's to paint. The `space:
    // SAMPLE` query keeps it out of the schema list in practice, so this pins
    // the rule rather than relying on the query staying that way: every path
    // has exactly one owning store, and admitting this one would hand it to
    // both halves of the composite store.
    expect([
      ...toExploreSampleClassificationPaths(
        ["frames.classifications"],
        ["frames.classifications"],
      ),
    ]).toEqual([]);
  });

  it("returns nothing when the dataset has no classification field", () => {
    expect([...toExploreSampleClassificationPaths(["cls"], [])]).toEqual([]);
  });

  it("returns nothing when no field is active", () => {
    expect([...toExploreSampleClassificationPaths([], ["cls"])]).toEqual([]);
  });
});

describe("toExploreOverlayPaths", () => {
  it("unions both namespaces into the bridge's scope", () => {
    expect([
      ...toExploreOverlayPaths(
        new Set(["frames.detections", "frames.classifications"]),
        new Set(["cls"]),
      ),
    ]).toEqual(["frames.detections", "frames.classifications", "cls"]);
  });

  it("keeps the sample-level side — its omission was the original bug", () => {
    const paths = toExploreOverlayPaths(
      new Set(["frames.detections"]),
      new Set(["cls"]),
    );

    expect(paths.has("cls")).toBe(true);
  });

  it("keeps the per-frame side", () => {
    const paths = toExploreOverlayPaths(
      new Set(["frames.detections"]),
      new Set(["cls"]),
    );

    expect(paths.has("frames.detections")).toBe(true);
  });

  it("survives either side being empty", () => {
    expect([
      ...toExploreOverlayPaths(new Set(["frames.detections"]), new Set()),
    ]).toEqual(["frames.detections"]);
    expect([...toExploreOverlayPaths(new Set(), new Set(["cls"]))]).toEqual([
      "cls",
    ]);
    expect([...toExploreOverlayPaths(new Set(), new Set())]).toEqual([]);
  });

  it("does not double-count a path both sides claim", () => {
    expect([
      ...toExploreOverlayPaths(
        new Set(["frames.detections"]),
        new Set(["frames.detections"]),
      ),
    ]).toEqual(["frames.detections"]);
  });
});
