import { describe, expect, it } from "vitest";
import {
  chooseAnnotationStream,
  chooseCalibrationStream,
  filterDefaultStreamEquivalents,
  findBestMatchingAnnotationStreams,
  orderDefaultStreamEquivalents,
  streamPrefix,
} from "./";

describe("chooseCalibrationStream", () => {
  it("prefers the exact camera_info sibling of the camera prefix", () => {
    expect(
      chooseCalibrationStream("/CAM_FRONT/image_rect_compressed", [
        "/CAM_BACK/camera_info",
        "/CAM_FRONT/camera_info",
      ]),
    ).toBe("/CAM_FRONT/camera_info");
  });

  it("falls back to shared-token scoring when no exact sibling exists", () => {
    expect(
      chooseCalibrationStream("/sensors/front/image_raw", [
        "/calibration/back_info",
        "/calibration/front_info",
      ]),
    ).toBe("/calibration/front_info");
  });

  it("returns no match when fuzzy calibration candidates tie", () => {
    expect(
      chooseCalibrationStream("/boxi/hesai/intensity_image", [
        "/boxi/alphasense/front_left/camera_info",
        "/boxi/alphasense/front_right/camera_info",
        "/boxi/hdr/front/camera_info",
      ]),
    ).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(chooseCalibrationStream("/CAM_FRONT/image_rect", [])).toBeNull();
    expect(
      chooseCalibrationStream("/CAM_FRONT/image_rect", ["/unrelated/xyz"]),
    ).toBeNull();
  });
});

describe("chooseAnnotationStream", () => {
  it("prefers the exact annotations sibling of the camera prefix", () => {
    expect(
      chooseAnnotationStream("/CAM_FRONT/image_rect_compressed", [
        "/CAM_BACK/annotations",
        "/CAM_FRONT/annotations",
      ]),
    ).toBe("/CAM_FRONT/annotations");
  });

  it("scores camera-identifying tokens over generic ones", () => {
    expect(
      chooseAnnotationStream("/camera/front/image_rect_compressed", [
        "/labels/back_camera",
        "/labels/front_camera",
      ]),
    ).toBe("/labels/front_camera");
  });

  it("groups every strongest camera match without weaker siblings", () => {
    expect(
      findBestMatchingAnnotationStreams(
        "/sensors/front/image_rect_compressed",
        [
          "/sensors/front/detections",
          "/sensors/back/detections",
          "/sensors/front/segmentations",
          "/unrelated/labels",
        ],
      ),
    ).toEqual(["/sensors/front/detections", "/sensors/front/segmentations"]);
  });

  it("returns no matches when topics share no camera identity", () => {
    expect(
      findBestMatchingAnnotationStreams("/CAM_FRONT/image_rect", [
        "/unrelated/labels",
      ]),
    ).toEqual([]);
  });
});

describe("streamPrefix", () => {
  it("strips image-format suffix segments", () => {
    expect(streamPrefix("/CAM_FRONT/image_rect_compressed")).toBe("/CAM_FRONT");
    expect(streamPrefix("/camera/front/image_raw")).toBe("/camera/front");
    expect(streamPrefix("/camera/front/image_downsampled")).toBe(
      "/camera/front",
    );
  });

  it("keeps non-image segments like camera_info", () => {
    expect(streamPrefix("/CAM_FRONT/camera_info")).toBe(
      "/CAM_FRONT/camera_info",
    );
  });
});

describe("default stream equivalents", () => {
  it("prefers a downsampled image sibling over its raw base topic", () => {
    expect(
      filterDefaultStreamEquivalents(
        ["/camera/front/image", "/camera/front/image_downsampled"],
        { getKind: () => "image", getStream: (topic) => topic },
      ),
    ).toEqual(["/camera/front/image_downsampled"]);
  });

  it("prefers a downsampled point cloud sibling over its base topic", () => {
    expect(
      filterDefaultStreamEquivalents(
        ["/lidar/points", "/lidar/points_downsampled"],
        { getKind: () => "point-cloud", getStream: (topic) => topic },
      ),
    ).toEqual(["/lidar/points_downsampled"]);
  });

  it("does not match equivalents across source kinds or different cameras", () => {
    expect(
      filterDefaultStreamEquivalents(
        [
          { id: "/camera/front/image", type: "image" },
          { id: "/camera/back/image_downsampled", type: "image" },
          { id: "/camera/front/image_downsampled", type: "point-cloud" },
        ],
        { getKind: (source) => source.type, getStream: (source) => source.id },
      ).map((source) => source.id),
    ).toEqual([
      "/camera/front/image",
      "/camera/back/image_downsampled",
      "/camera/front/image_downsampled",
    ]);
  });

  it("keeps a lone compressed topic available as its own default", () => {
    expect(
      filterDefaultStreamEquivalents(["/camera/front/image_rect_compressed"], {
        getKind: () => "image",
        getStream: (topic) => topic,
      }),
    ).toEqual(["/camera/front/image_rect_compressed"]);
  });

  it("does not collapse streams that only differ by an extra qualifier", () => {
    expect(
      filterDefaultStreamEquivalents(
        [
          "/sensors/primary/image_rect_compressed",
          "/sensors/primary/left/image_rect_compressed",
          "/sensors/primary/right/image_rect_compressed",
        ],
        { getKind: () => "image", getStream: (topic) => topic },
      ),
    ).toEqual([
      "/sensors/primary/image_rect_compressed",
      "/sensors/primary/left/image_rect_compressed",
      "/sensors/primary/right/image_rect_compressed",
    ]);
  });

  it("still prefers representations only within the exact stream identity", () => {
    expect(
      filterDefaultStreamEquivalents(
        [
          "/sensors/primary/image",
          "/sensors/primary/image_downsampled",
          "/sensors/primary/left/image_rect_compressed",
        ],
        { getKind: () => "image", getStream: (topic) => topic },
      ),
    ).toEqual([
      "/sensors/primary/image_downsampled",
      "/sensors/primary/left/image_rect_compressed",
    ]);
  });

  it("moves preferred equivalents before raw siblings without removing either", () => {
    expect(
      orderDefaultStreamEquivalents(
        [
          "/camera/front/image",
          "/camera/back/image",
          "/camera/front/image_downsampled",
        ],
        { getKind: () => "image", getStream: (topic) => topic },
      ),
    ).toEqual([
      "/camera/front/image_downsampled",
      "/camera/front/image",
      "/camera/back/image",
    ]);
  });
});
