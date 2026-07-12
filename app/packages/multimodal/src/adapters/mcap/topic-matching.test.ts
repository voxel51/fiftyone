import { describe, expect, it } from "vitest";
import {
  chooseAnnotationTopic,
  chooseCalibrationTopic,
  filterDefaultTopicEquivalents,
  findBestMatchingAnnotationTopics,
  orderDefaultTopicEquivalents,
  topicPrefix,
} from "./topic-matching";

describe("chooseCalibrationTopic", () => {
  it("prefers the exact camera_info sibling of the camera prefix", () => {
    expect(
      chooseCalibrationTopic("/CAM_FRONT/image_rect_compressed", [
        "/CAM_BACK/camera_info",
        "/CAM_FRONT/camera_info",
      ]),
    ).toBe("/CAM_FRONT/camera_info");
  });

  it("falls back to shared-token scoring when no exact sibling exists", () => {
    expect(
      chooseCalibrationTopic("/sensors/front/image_raw", [
        "/calibration/back_info",
        "/calibration/front_info",
      ]),
    ).toBe("/calibration/front_info");
  });

  it("returns null when nothing matches", () => {
    expect(chooseCalibrationTopic("/CAM_FRONT/image_rect", [])).toBeNull();
    expect(
      chooseCalibrationTopic("/CAM_FRONT/image_rect", ["/unrelated/xyz"]),
    ).toBeNull();
  });
});

describe("chooseAnnotationTopic", () => {
  it("prefers the exact annotations sibling of the camera prefix", () => {
    expect(
      chooseAnnotationTopic("/CAM_FRONT/image_rect_compressed", [
        "/CAM_BACK/annotations",
        "/CAM_FRONT/annotations",
      ]),
    ).toBe("/CAM_FRONT/annotations");
  });

  it("scores camera-identifying tokens over generic ones", () => {
    expect(
      chooseAnnotationTopic("/camera/front/image_rect_compressed", [
        "/labels/back_camera",
        "/labels/front_camera",
      ]),
    ).toBe("/labels/front_camera");
  });

  it("groups every strongest camera match without weaker siblings", () => {
    expect(
      findBestMatchingAnnotationTopics("/sensors/front/image_rect_compressed", [
        "/sensors/front/detections",
        "/sensors/back/detections",
        "/sensors/front/segmentations",
        "/unrelated/labels",
      ]),
    ).toEqual(["/sensors/front/detections", "/sensors/front/segmentations"]);
  });

  it("returns no matches when topics share no camera identity", () => {
    expect(
      findBestMatchingAnnotationTopics("/CAM_FRONT/image_rect", [
        "/unrelated/labels",
      ]),
    ).toEqual([]);
  });
});

describe("topicPrefix", () => {
  it("strips image-format suffix segments", () => {
    expect(topicPrefix("/CAM_FRONT/image_rect_compressed")).toBe("/CAM_FRONT");
    expect(topicPrefix("/camera/front/image_raw")).toBe("/camera/front");
    expect(topicPrefix("/camera/front/image_downsampled")).toBe(
      "/camera/front",
    );
  });

  it("keeps non-image segments like camera_info", () => {
    expect(topicPrefix("/CAM_FRONT/camera_info")).toBe(
      "/CAM_FRONT/camera_info",
    );
  });
});

describe("default topic equivalents", () => {
  it("prefers a downsampled image sibling over its raw base topic", () => {
    expect(
      filterDefaultTopicEquivalents(
        ["/camera/front/image", "/camera/front/image_downsampled"],
        { getKind: () => "image", getTopic: (topic) => topic },
      ),
    ).toEqual(["/camera/front/image_downsampled"]);
  });

  it("prefers a downsampled point cloud sibling over its base topic", () => {
    expect(
      filterDefaultTopicEquivalents(
        ["/lidar/points", "/lidar/points_downsampled"],
        { getKind: () => "point-cloud", getTopic: (topic) => topic },
      ),
    ).toEqual(["/lidar/points_downsampled"]);
  });

  it("does not match equivalents across source kinds or different cameras", () => {
    expect(
      filterDefaultTopicEquivalents(
        [
          { id: "/camera/front/image", type: "image" },
          { id: "/camera/back/image_downsampled", type: "image" },
          { id: "/camera/front/image_downsampled", type: "point-cloud" },
        ],
        { getKind: (source) => source.type, getTopic: (source) => source.id },
      ).map((source) => source.id),
    ).toEqual([
      "/camera/front/image",
      "/camera/back/image_downsampled",
      "/camera/front/image_downsampled",
    ]);
  });

  it("keeps a lone compressed topic available as its own default", () => {
    expect(
      filterDefaultTopicEquivalents(["/camera/front/image_rect_compressed"], {
        getKind: () => "image",
        getTopic: (topic) => topic,
      }),
    ).toEqual(["/camera/front/image_rect_compressed"]);
  });

  it("does not collapse streams that only differ by an extra qualifier", () => {
    expect(
      filterDefaultTopicEquivalents(
        [
          "/sensors/primary/image_rect_compressed",
          "/sensors/primary/left/image_rect_compressed",
          "/sensors/primary/right/image_rect_compressed",
        ],
        { getKind: () => "image", getTopic: (topic) => topic },
      ),
    ).toEqual([
      "/sensors/primary/image_rect_compressed",
      "/sensors/primary/left/image_rect_compressed",
      "/sensors/primary/right/image_rect_compressed",
    ]);
  });

  it("still prefers representations only within the exact stream identity", () => {
    expect(
      filterDefaultTopicEquivalents(
        [
          "/sensors/primary/image",
          "/sensors/primary/image_downsampled",
          "/sensors/primary/left/image_rect_compressed",
        ],
        { getKind: () => "image", getTopic: (topic) => topic },
      ),
    ).toEqual([
      "/sensors/primary/image_downsampled",
      "/sensors/primary/left/image_rect_compressed",
    ]);
  });

  it("moves preferred equivalents before raw siblings without removing either", () => {
    expect(
      orderDefaultTopicEquivalents(
        [
          "/camera/front/image",
          "/camera/back/image",
          "/camera/front/image_downsampled",
        ],
        { getKind: () => "image", getTopic: (topic) => topic },
      ),
    ).toEqual([
      "/camera/front/image_downsampled",
      "/camera/front/image",
      "/camera/back/image",
    ]);
  });
});
