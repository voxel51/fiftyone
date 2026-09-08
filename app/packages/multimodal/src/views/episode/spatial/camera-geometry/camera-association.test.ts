import { describe, expect, it } from "vitest";

import { resolveFrustumImageStreams } from "./camera-association";

describe("resolveFrustumImageStreams", () => {
  it("keeps inventory-owned associations without overrides", () => {
    expect(
      resolveFrustumImageStreams({
        cameraStreams: ["/front/info", "/rear/info"],
        inventoryImageStreams: ["/front/image", "/rear/image"],
        settingsByImageStream: {},
      }),
    ).toEqual(["/front/image", "/rear/image"]);
  });

  it("moves an image to its explicitly selected calibration", () => {
    expect(
      resolveFrustumImageStreams({
        cameraStreams: ["/front/info", "/rear/info"],
        inventoryImageStreams: ["/front/image", "/rear/image"],
        settingsByImageStream: {
          "/front/image": { calibrationStream: "/rear/info" },
        },
      }),
    ).toEqual(["", "/front/image"]);
  });

  it("chooses deterministically when stored overrides conflict", () => {
    expect(
      resolveFrustumImageStreams({
        cameraStreams: ["/camera/info"],
        inventoryImageStreams: ["/z/image"],
        settingsByImageStream: {
          "/z/image": { calibrationStream: "/camera/info" },
          "/a/image": { calibrationStream: "/camera/info" },
        },
      }),
    ).toEqual(["/a/image"]);
  });
});
