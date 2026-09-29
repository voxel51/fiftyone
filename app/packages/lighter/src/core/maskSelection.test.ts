/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Full-media masks have to be SELECTABLE, not merely paintable.
 *
 * `Scene2D.addOverlay` registers an overlay with the selection manager only
 * when it satisfies the `Selectable` duck-type AND reports a non-negative
 * priority. Segmentation and Heatmap satisfied neither, so clicking one did
 * nothing at all — no outline, because there was no selection to draw.
 */

import { describe, expect, it } from "vitest";

import type { OverlayMask } from "@fiftyone/looker/src/numpy";

import { HeatmapOverlay } from "../overlay/HeatmapOverlay";
import { SegmentationOverlay } from "../overlay/SegmentationOverlay";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { ResourceLoader } from "../resource/ResourceLoader";
import { Scene2D } from "./Scene2D";

const stubRenderer = {} as Renderer2D;
const stubResourceLoader = {} as ResourceLoader;

const makeScene = () =>
  new Scene2D({
    canvas: document.createElement("canvas"),
    renderer: stubRenderer,
    resourceLoader: stubResourceLoader,
    sceneId: `mask-selection-test-${Math.random()}`,
  });

const source = (): OverlayMask =>
  ({
    channels: 1,
    arrayType: "Uint8Array",
    shape: [2, 2],
    buffer: new Uint8Array([0, 1, 1, 0]).buffer,
  }) as unknown as OverlayMask;

const overlays = () => [
  new SegmentationOverlay({
    id: "seg",
    field: "frames.segmentation",
    label: { _id: "seg", _cls: "Segmentation", mask: source() },
  }),
  new HeatmapOverlay({
    id: "heat",
    field: "frames.heatmap",
    label: { _id: "heat", _cls: "Heatmap", map: source() },
  }),
];

describe("full-media mask selection", () => {
  it("registers with the scene's selection manager", () => {
    for (const overlay of overlays()) {
      const scene = makeScene();
      scene.addOverlay(overlay);

      scene.selectOverlay(overlay.id);

      expect(overlay.isSelected()).toBe(true);
    }
  });

  it("deselects through the scene", () => {
    for (const overlay of overlays()) {
      const scene = makeScene();
      scene.addOverlay(overlay);

      scene.selectOverlay(overlay.id);
      scene.deselectOverlay(overlay.id);

      expect(overlay.isSelected()).toBe(false);
    }
  });

  it("clears with the rest of the selection", () => {
    const scene = makeScene();
    const all = overlays();

    for (const overlay of all) {
      scene.addOverlay(overlay);
      scene.selectOverlay(overlay.id);
    }

    scene.clearSelection();

    for (const overlay of all) {
      expect(overlay.isSelected()).toBe(false);
    }
  });
});
