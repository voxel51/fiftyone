import { describe, expect, it } from "vitest";

import { resolveMcapFrustumImageTopics } from "./mcap-camera-association";

describe("resolveMcapFrustumImageTopics", () => {
  it("keeps inventory-owned associations without overrides", () => {
    expect(
      resolveMcapFrustumImageTopics({
        cameraTopics: ["/front/info", "/rear/info"],
        inventoryImageTopics: ["/front/image", "/rear/image"],
        settingsByImageTopic: {},
      }),
    ).toEqual(["/front/image", "/rear/image"]);
  });

  it("moves an image to its explicitly selected calibration", () => {
    expect(
      resolveMcapFrustumImageTopics({
        cameraTopics: ["/front/info", "/rear/info"],
        inventoryImageTopics: ["/front/image", "/rear/image"],
        settingsByImageTopic: {
          "/front/image": { calibrationTopic: "/rear/info" },
        },
      }),
    ).toEqual(["", "/front/image"]);
  });

  it("chooses deterministically when stored overrides conflict", () => {
    expect(
      resolveMcapFrustumImageTopics({
        cameraTopics: ["/camera/info"],
        inventoryImageTopics: ["/z/image"],
        settingsByImageTopic: {
          "/z/image": { calibrationTopic: "/camera/info" },
          "/a/image": { calibrationTopic: "/camera/info" },
        },
      }),
    ).toEqual(["/a/image"]);
  });
});
