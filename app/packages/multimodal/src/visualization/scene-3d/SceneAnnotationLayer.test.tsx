import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VISUALIZATION_KIND } from "../visualization-registry";
import { SceneAnnotationLayer } from "./SceneAnnotationLayer";
import type { SceneAnnotationPanelLayer } from "./types";

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: () => void }) => unknown) =>
    selector({ invalidate: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SceneAnnotationLayer", () => {
  it("clears an active entity hover exactly once when it unmounts", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onHoverEntity = vi.fn();
    const layer: SceneAnnotationPanelLayer = {
      frame: {
        deletions: [],
        entities: [
          {
            arrowCount: 0,
            arrows: [],
            cubeCount: 0,
            cubes: [],
            cylinderCount: 0,
            cylinders: [],
            frameLocked: false,
            id: "hovered-entity",
            lineCount: 0,
            lines: [],
            metadata: {},
            modelCount: 0,
            models: [],
            sphereCount: 0,
            spheres: [],
            textCount: 0,
            texts: [],
            triangleCount: 0,
            triangles: [],
          },
        ],
        kind: VISUALIZATION_KIND.SCENE_UPDATE,
      },
      id: "/annotations",
      onHoverEntity,
    };
    const { container, unmount } = render(
      <SceneAnnotationLayer layer={layer} />,
    );
    const entityGroup = container.querySelectorAll("group")[1];

    fireEvent.pointerOver(entityGroup);
    unmount();

    expect(onHoverEntity).toHaveBeenNthCalledWith(1, "hovered-entity");
    expect(onHoverEntity).toHaveBeenNthCalledWith(2, null);
    expect(onHoverEntity).toHaveBeenCalledTimes(2);
  });
});
