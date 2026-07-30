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
        label3dProjection: {
          enabled: false,
          interpolate: false,
          streams: [],
        },
        pointCloudProjection: {
          enabled: true,
          pointSize: 6,
          streams: null,
        },
        pointCloudSources: [
          source("/lidar", "Top lidar", SCENE_SOURCE_TYPE.POINT_CLOUD),
        ],
        sceneAnnotationSources: [],
        selectedLabelStreams: [],
        selectedProjectionStreams: ["/lidar"],
        selectedSceneAnnotationStreams: [],
        setCameraProjection: vi.fn(),
        setLabel3dProjection: vi.fn(),
        setLabelStreams: vi.fn(),
        setPointCloudProjection,
        setStream: vi.fn(),
        stream: "/camera",
        toggleLabelStream: vi.fn(),
        toggleProjectionStream: vi.fn(),
        toggleSceneAnnotationStream: vi.fn(),
      }),
    );

    expect(screen.getByLabelText("Source")).toBeTruthy();
    expect(screen.getByText("3D Projection")).toBeTruthy();
    expect(screen.getByText("Pointclouds")).toBeTruthy();
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
        label3dProjection: {
          enabled: true,
          interpolate: false,
          streams: null,
        },
        pointCloudProjection: {
          enabled: false,
          pointSize: 6,
          streams: null,
        },
        pointCloudSources: [],
        sceneAnnotationSources: [],
        selectedLabelStreams: [],
        selectedProjectionStreams: [],
        selectedSceneAnnotationStreams: [],
        setCameraProjection: vi.fn(),
        setLabel3dProjection: vi.fn(),
        setLabelStreams: vi.fn(),
        setPointCloudProjection: vi.fn(),
        setStream: vi.fn(),
        stream: image.id,
        toggleLabelStream,
        toggleProjectionStream: vi.fn(),
        toggleSceneAnnotationStream: vi.fn(),
      }),
    );

    expect(screen.getByText("Matching")).toBeTruthy();
    expect(screen.getByText("Remaining")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: matching.label }));
    expect(toggleLabelStream).toHaveBeenCalledWith("12", true);
  });

  it("changes only matching streams from the master labels toggle", () => {
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
    const labelSourceGroups = groupImageLabelSources(image, annotationSources);
    const setLabelStreams = vi.fn();
    const props = (
      selectedLabelStreams: readonly string[],
    ): React.ComponentProps<typeof ImageTileSettings> => ({
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
      labelSourceGroups,
      label3dProjection: {
        enabled: true,
        interpolate: false,
        streams: null,
      },
      pointCloudProjection: {
        enabled: false,
        pointSize: 6,
        streams: null,
      },
      pointCloudSources: [],
      sceneAnnotationSources: [],
      selectedLabelStreams,
      selectedProjectionStreams: [],
      selectedSceneAnnotationStreams: [],
      setCameraProjection: vi.fn(),
      setLabel3dProjection: vi.fn(),
      setLabelStreams,
      setPointCloudProjection: vi.fn(),
      setStream: vi.fn(),
      stream: image.id,
      toggleLabelStream: vi.fn(),
      toggleProjectionStream: vi.fn(),
      toggleSceneAnnotationStream: vi.fn(),
    });

    const { rerender } = render(
      React.createElement(ImageTileSettings, props([remaining.id])),
    );
    const toggle = screen.getByRole("switch", {
      name: "Toggle matching labels",
    });

    fireEvent.click(toggle);
    expect(setLabelStreams).toHaveBeenLastCalledWith([
      matching.id,
      remaining.id,
    ]);

    rerender(
      React.createElement(
        ImageTileSettings,
        props([matching.id, remaining.id]),
      ),
    );
    fireEvent.click(toggle);
    expect(setLabelStreams).toHaveBeenLastCalledWith([remaining.id]);
  });

  it("provides dedicated per-topic 3D label projection controls", () => {
    const setLabel3dProjection = vi.fn();
    const toggleSceneAnnotationStream = vi.fn();
    const camera = source("/camera", "Front camera", SCENE_SOURCE_TYPE.IMAGE);
    const detections = source(
      "/detections_3d",
      "3D detections",
      SCENE_SOURCE_TYPE.SCENE_ANNOTATION,
    );

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
        geometryControlLabel: "Auto",
        geometryStatus: "",
        images: [camera],
        labelSourceGroups: { matching: [], remaining: [] },
        label3dProjection: {
          enabled: false,
          interpolate: false,
          streams: [],
        },
        pointCloudProjection: {
          enabled: false,
          pointSize: 6,
          streams: [],
        },
        pointCloudSources: [],
        sceneAnnotationSources: [detections],
        selectedLabelStreams: [],
        selectedProjectionStreams: [],
        selectedSceneAnnotationStreams: [],
        setCameraProjection: vi.fn(),
        setLabel3dProjection,
        setLabelStreams: vi.fn(),
        setPointCloudProjection: vi.fn(),
        setStream: vi.fn(),
        stream: camera.id,
        toggleLabelStream: vi.fn(),
        toggleProjectionStream: vi.fn(),
        toggleSceneAnnotationStream,
      }),
    );

    expect(screen.getByText("3D Projection")).toBeTruthy();
    expect(screen.getByText("3D Labels")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("switch", { name: "Interpolate projections" }),
    );
    expect(setLabel3dProjection).toHaveBeenCalledWith({
      interpolate: true,
    });
    fireEvent.click(screen.getByRole("checkbox", { name: detections.label }));
    expect(toggleSceneAnnotationStream).toHaveBeenCalledWith(
      detections.id,
      true,
    );

    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle 3D label projections" }),
    );
    expect(setLabel3dProjection).toHaveBeenCalledWith({
      enabled: true,
      streams: null,
    });
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
