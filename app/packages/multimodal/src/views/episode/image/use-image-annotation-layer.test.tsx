import { act, cleanup, renderHook } from "@testing-library/react";
import { PlaybackProvider } from "@fiftyone/playback";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { VISUALIZATION_KIND } from "../../../visualization";
import type { ImageAnnotationSetInput } from "../../../visualization/media-2d/gpu-image-annotation-preparation";
import { resetGpuImageAnnotationResourcesForTests } from "../../../visualization/media-2d/gpu-image-annotation-resources";
import { hoverEchoAtom } from "../interaction/point-hover/hover-echo";
import { useImageAnnotationLayer } from "./use-image-annotation-layer";

afterEach(() => {
  cleanup();
  resetGpuImageAnnotationResourcesForTests();
});

describe("projected scene-annotation hover", () => {
  it("publishes 2D hover identity and highlights a matching 3D hover", () => {
    const store = createStore();
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <PlaybackProvider duration={1}>
        <Provider store={store}>{children}</Provider>
      </PlaybackProvider>
    );
    const { result } = renderHook(
      () =>
        useImageAnnotationLayer({
          additionalSets: [PROJECTED_CUBOID],
          resourceKey: "projected-cuboid-hover-test",
          streams: [],
        }),
      { wrapper },
    );

    act(() => result.current.setHoveredPrimitiveIndex(0));
    expect(store.get(hoverEchoAtom)).toEqual({
      entityId: "car-1",
      kind: "scene-annotation",
      stream: "/detections_3d",
    });

    act(() => result.current.setHoveredPrimitiveIndex(null));
    expect(store.get(hoverEchoAtom)).toBeNull();

    act(() => {
      store.set(hoverEchoAtom, {
        entityId: "car-1",
        kind: "scene-annotation",
        stream: "/detections_3d",
      });
    });
    expect(result.current.highlightResource.segments.count).toBe(1);
  });
});

const PROJECTED_CUBOID: ImageAnnotationSetInput = {
  frame: {
    circles: [],
    kind: VISUALIZATION_KIND.IMAGE_ANNOTATIONS,
    points: [
      {
        fillColor: null,
        outlineColor: null,
        outlineColors: [],
        points: [
          [10, 10],
          [20, 20],
        ],
        thickness: 2,
        type: "line-list",
      },
    ],
    texts: [],
  },
  renderMetadata: {
    lineListGroups: [
      [
        {
          bounds: { maxX: 20, maxY: 20, minX: 10, minY: 10 },
          key: "car-1:cube:0",
          label: "car",
          points: [
            [10, 10],
            [20, 20],
          ],
          sceneEntityId: "car-1",
          segments: [
            [
              [10, 10],
              [20, 20],
            ],
          ],
        },
      ],
    ],
  },
  stream: "/detections_3d",
};
