import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SCENE_SOURCE_TYPE, type SceneSource } from "../../../ir";
import { MAX_POINT_CLOUD_POINT_SIZE } from "../settings/modal/state";
import { groupImageLabelSources } from "./image-label-source-groups";
import ImageTileSettings from "./ImageTileSettings";

afterEach(cleanup);

describe("ImageTileSettings", () => {
  it("renders tile controls and applies bounded point-size updates", () => {
    const setPointCloudProjection = vi.fn();
    render(
      React.createElement(ImageTileSettings, {
        annotationSources: [],
        annotationStreams: [],
        calibrationSelectionLabel: "Auto · no match",
        calibrationSources: [],
        cameraProjection: {
          calibrationStream: null,
          display: "recorded",
          enabled: false,
          geometry: "auto",
          pointSize: 6,
          streams: null,
        },
        canConfigureCameraGeometry: true,
        geometryControlLabel: "Auto → Original",
        geometryStatus: "Original camera · pinhole",
        images: [source("/camera", "Front camera", SCENE_SOURCE_TYPE.IMAGE)],
        labelSourceGroups: { matching: [], remaining: [] },
        pointCloudProjection: {
          enabled: true,
          pointSize: 6,
          streams: null,
        },
        pointCloudSources: [
          source("/lidar", "Top lidar", SCENE_SOURCE_TYPE.POINT_CLOUD),
        ],
        selectedLabelStreams: [],
        selectedProjectionStreams: ["/lidar"],
        setCameraProjection: vi.fn(),
        setLabelStreams: vi.fn(),
        setPointCloudProjection,
        setStream: vi.fn(),
        stream: "/camera",
        toggleLabelStream: vi.fn(),
        toggleProjectionStream: vi.fn(),
      }),
    );

    expect(screen.getByLabelText("Source")).toBeTruthy();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Point size" }), {
      target: { value: "100" },
    });
    expect(setPointCloudProjection).toHaveBeenCalledWith({
      pointSize: MAX_POINT_CLOUD_POINT_SIZE,
    });
  });

  it("shows source-name matches while toggling canonical annotation ids", () => {
    const toggleLabelStream = vi.fn();
    const image = source(
      "7",
      "Front camera",
      SCENE_SOURCE_TYPE.IMAGE,
      "/camera/front/image_raw",
    );
    const matching = source(
      "12",
      "Front detections",
      SCENE_SOURCE_TYPE.IMAGE_ANNOTATION,
      "/camera/front/detections",
    );
    const remaining = source(
      "13",
      "Rear detections",
      SCENE_SOURCE_TYPE.IMAGE_ANNOTATION,
      "/camera/rear/detections",
    );
    const annotationSources = [matching, remaining];

    render(
      React.createElement(ImageTileSettings, {
        annotationSources,
        annotationStreams: annotationSources.map((source) => source.id),
        calibrationSelectionLabel: "Auto · no match",
        calibrationSources: [],
        cameraProjection: {
          calibrationStream: null,
          display: "recorded",
          enabled: false,
          geometry: "auto",
          pointSize: 6,
          streams: null,
        },
        canConfigureCameraGeometry: false,
        geometryControlLabel: "Auto",
        geometryStatus: "",
        images: [image],
        labelSourceGroups: groupImageLabelSources(image, annotationSources),
        pointCloudProjection: {
          enabled: false,
          pointSize: 6,
          streams: null,
        },
        pointCloudSources: [],
        selectedLabelStreams: [],
        selectedProjectionStreams: [],
        setCameraProjection: vi.fn(),
        setLabelStreams: vi.fn(),
        setPointCloudProjection: vi.fn(),
        setStream: vi.fn(),
        stream: image.id,
        toggleLabelStream,
        toggleProjectionStream: vi.fn(),
      }),
    );

    expect(screen.getByText("Matching")).toBeTruthy();
    expect(screen.getByText("Remaining")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: matching.label }));
    expect(toggleLabelStream).toHaveBeenCalledWith("12", true);
  });
});

function source(
  id: string,
  label: string,
  type: string,
  sourceName = id,
): SceneSource {
  return { id, label, sourceName, type };
}
