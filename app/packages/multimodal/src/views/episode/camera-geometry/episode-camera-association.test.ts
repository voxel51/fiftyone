import { describe, expect, it } from "vitest";

import { resolveEpisodeFrustumImageStreams } from "./episode-camera-association";

describe("resolveEpisodeFrustumImageStreams", () => {
  it("keeps inventory-owned associations without overrides", () => {
    expect(
      resolveEpisodeFrustumImageStreams({
        cameraStreams: ["/front/info", "/rear/info"],
        inventoryImageStreams: ["/front/image", "/rear/image"],
        settingsByImageStream: {},
      }),
    ).toEqual(["/front/image", "/rear/image"]);
  });

  it("moves an image to its explicitly selected calibration", () => {
    expect(
      resolveEpisodeFrustumImageStreams({
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
      resolveEpisodeFrustumImageStreams({
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
