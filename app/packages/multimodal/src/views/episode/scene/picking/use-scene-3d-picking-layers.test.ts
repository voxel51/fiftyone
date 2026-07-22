import { describe, expect, it } from "vitest";

import { toggleSceneEntitySelection } from "./use-scene-3d-picking-layers";

describe("scene 3D picking layers", () => {
  it("toggles instance selection and widens it to label scope", () => {
    const entity = {
      frameId: "ego",
      id: "car-1",
      label: "vehicle",
      metadata: { score: 0.9 },
    } as never;
    const selected = toggleSceneEntitySelection(
      null,
      entity,
      "/annotations",
      "car-1",
      false,
    );

    expect(selected).toMatchObject({ entityId: "car-1", scope: "instance" });
    expect(
      toggleSceneEntitySelection(
        selected,
        entity,
        "/annotations",
        "car-1",
        false,
      ),
    ).toBeNull();
    expect(
      toggleSceneEntitySelection(
        selected,
        entity,
        "/annotations",
        "car-1",
        true,
      ),
    ).toMatchObject({ scope: "label" });
  });
});
