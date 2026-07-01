import { describe, expect, it } from "vitest";
import {
  chooseAnnotationTopic,
  chooseCalibrationTopic,
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
});

describe("topicPrefix", () => {
  it("strips image-format suffix segments", () => {
    expect(topicPrefix("/CAM_FRONT/image_rect_compressed")).toBe("/CAM_FRONT");
    expect(topicPrefix("/camera/front/image_raw")).toBe("/camera/front");
  });

  it("keeps non-image segments like camera_info", () => {
    expect(topicPrefix("/CAM_FRONT/camera_info")).toBe(
      "/CAM_FRONT/camera_info",
    );
  });
});
