import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { WorldGridLayer, createWorldGridMaterial } from "./WorldGridLayer";

vi.mock("@react-three/fiber", () => ({
  useThree: (
    selector: (state: {
      invalidate: () => void;
      viewport: { dpr: number };
    }) => unknown,
  ) => selector({ invalidate: vi.fn(), viewport: { dpr: 1 } }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("createWorldGridMaterial", () => {
  it("builds a non-occluding transparent node material", () => {
    const material = createWorldGridMaterial({
      opacity: 0.05,
      spacing: 1,
      thicknessPx: 1,
      up: "z",
    });

    // The grid must never occlude scene content or write depth, and must
    // read from below as well as above.
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.side).toBe(THREE.DoubleSide);

    // The camera-centered quad and the line intensity are shader-driven.
    expect(material.positionNode).not.toBeNull();
    expect(material.opacityNode).not.toBeNull();
  });

  it("builds a material for every supported up axis", () => {
    for (const up of ["x", "y", "z"] as const) {
      const material = createWorldGridMaterial({
        opacity: 0.05,
        spacing: 1,
        thicknessPx: 1,
        up,
      });
      expect(material.positionNode).not.toBeNull();
      expect(material.opacityNode).not.toBeNull();
    }
  });
});

describe("WorldGridLayer", () => {
  it("renders the grid mesh drawn before other transparents", () => {
    const { container } = render(<WorldGridLayer />);

    // `frustumCulled={false}` and the no-op raycast can't be observed
    // through the serialized DOM (react-dom drops false/function props);
    // they are covered by the props on the mesh element itself.
    const mesh = container.querySelector('mesh[name="world-grid"]');
    expect(mesh).not.toBeNull();
    expect(Number(mesh?.getAttribute("renderOrder"))).toBeLessThan(0);
  });
});
