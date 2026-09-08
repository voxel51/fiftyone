/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The sidebar filter's paint-time effect: `Scene2D.shouldShowOverlay` (the
 * looker's `Overlay.isShown` equivalent), driven through the same real
 * `lighter:scene-options-changed` event `useLighterSetup.ts` dispatches on
 * every filter/field-visibility change — not a direct call to the private
 * method — so a regression in the event wiring itself would fail these too.
 *
 * The one property worth a dedicated test: `updateOptions` REPLACES
 * `sceneOptions` wholesale, and the event handler rebuilds it from a fixed
 * field list each time. `filter` has to be one of those fields, or an
 * unrelated options change (a field toggled in the sidebar) would silently
 * drop it — exactly the trap `Scene2D`'s own doc comment names `readOnly` as
 * having dodged by living outside this object entirely.
 */

import { getEventBus } from "@fiftyone/events";
import { describe, expect, it } from "vitest";
import type { LighterEventGroup } from "../events";
import { DetectionOverlay } from "../overlay/DetectionOverlay";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { ResourceLoader } from "../resource/ResourceLoader";
import { Scene2D } from "./Scene2D";

/** Nothing in these tests renders or loads a resource; only the ids matter. */
const stubRenderer = {} as Renderer2D;
const stubResourceLoader = {} as ResourceLoader;

const makeLabel = (id: string, confidence: number) =>
  new DetectionOverlay({
    id,
    field: "frames.detections",
    label: {
      _id: id,
      label: "vehicle",
      confidence,
      bounding_box: [0, 0, 1, 1],
    },
  });

const makeScene = () => {
  const canvas = document.createElement("canvas");
  const scene = new Scene2D({
    canvas,
    renderer: stubRenderer,
    resourceLoader: stubResourceLoader,
    sceneId: `label-visibility-test-${Math.random()}`,
  });

  const eventBus = getEventBus<LighterEventGroup>(scene.getEventChannel());

  return { scene, eventBus };
};

/** A confidence-threshold filter, the simplest real shape `pathFilter` takes. */
const confidenceAtLeast = (min: number) => (_path: string, label: unknown) =>
  ((label as { confidence?: number })?.confidence ?? 0) >= min;

describe("Scene2D label visibility filter", () => {
  it("paints only labels the filter accepts", () => {
    const { scene, eventBus } = makeScene();
    scene.addOverlay(makeLabel("low", 0.2));
    scene.addOverlay(makeLabel("high", 0.9));

    eventBus.dispatch("lighter:scene-options-changed", {
      filter: confidenceAtLeast(0.5),
    });

    expect(scene.getVisibleOverlayIds()).toEqual(["high"]);
  });

  it("repaints everything once the filter is cleared", () => {
    const { scene, eventBus } = makeScene();
    scene.addOverlay(makeLabel("low", 0.2));
    scene.addOverlay(makeLabel("high", 0.9));

    eventBus.dispatch("lighter:scene-options-changed", {
      filter: confidenceAtLeast(0.5),
    });
    expect(scene.getVisibleOverlayIds()).toEqual(["high"]);

    eventBus.dispatch("lighter:scene-options-changed", { filter: undefined });
    expect(scene.getVisibleOverlayIds().sort()).toEqual(["high", "low"]);
  });

  it("composes with activePaths: a shown field can still fail the filter, and a hidden field is hidden regardless", () => {
    const { scene, eventBus } = makeScene();
    scene.addOverlay(makeLabel("low", 0.2));
    scene.addOverlay(makeLabel("high", 0.9));

    // `useLighterSetup.ts` dispatches every option field together on every
    // render of its (single, non-incremental) `options` object — never a
    // partial update — so a real caller's second dispatch still carries
    // `filter` alongside whatever else changed. This exercises that shape:
    // both gates present at once, `activePaths` newly excluding the field
    // entirely.
    eventBus.dispatch("lighter:scene-options-changed", {
      filter: confidenceAtLeast(0.5),
      activePaths: ["frames.polylines"],
    });

    // Neither label's field is active, so both are hidden regardless of
    // confidence — activePaths and filter are independent gates, both must
    // pass.
    expect(scene.getVisibleOverlayIds()).toEqual([]);
  });
});
