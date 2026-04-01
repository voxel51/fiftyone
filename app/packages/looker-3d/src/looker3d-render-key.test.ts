import { describe, expect, it } from "vitest";
import { getLooker3dRenderKey } from "./looker3d-render-key";

describe("getLooker3dRenderKey", () => {
  it("keeps grouped direct-3d viewers stable when no fo3d slice is active", () => {
    expect(
      getLooker3dRenderKey({
        modalSampleId: "camera-front-id",
        activeFo3dSlice: null,
      })
    ).toBe("camera-front-id:default");
  });

  it("changes the key when the rendered fo3d slice changes", () => {
    expect(
      getLooker3dRenderKey({
        modalSampleId: "camera-front-id",
        activeFo3dSlice: "scene-left",
      })
    ).toBe("camera-front-id:scene-left:default");
  });

  it("changes the key when the render context changes", () => {
    expect(
      getLooker3dRenderKey({
        modalSampleId: "camera-front-id",
        activeFo3dSlice: "scene-left",
        renderContext: "annotate-focused",
      })
    ).toBe("camera-front-id:scene-left:annotate-focused");
  });
});
