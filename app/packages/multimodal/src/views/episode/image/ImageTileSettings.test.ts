import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SCENE_SOURCE_TYPE, type SceneSource } from "../../../ir";
import { MAX_POINT_CLOUD_POINT_SIZE } from "../settings/modal/state";
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
});

function source(id: string, label: string, type: string): SceneSource {
  return { id, label, type };
}
