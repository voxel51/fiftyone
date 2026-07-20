import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EPISODE_GRID_STREAM_AUTO,
  __resetEpisodeGridStreamStateForTests,
  useRegisterEpisodeGridStreams,
  useEpisodeGridSelectedStream,
  useEpisodeGridStreams,
} from "./episode-grid-stream-state";

describe("episode-grid-stream-state", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetEpisodeGridStreamStateForTests();
  });

  afterEach(() => {
    localStorage.clear();
    __resetEpisodeGridStreamStateForTests();
  });

  it("aggregates streams across mounted samples and removes them on cleanup", () => {
    const { result } = renderHook(() => ({
      register: useRegisterEpisodeGridStreams(),
      streams: useEpisodeGridStreams("dataset"),
    }));

    expect(result.current.streams).toEqual([]);

    let cleanupFront: () => void = () => undefined;
    act(() => {
      cleanupFront = result.current.register({
        datasetName: "dataset",
        sampleId: "sample-front",
        streams: ["/camera/front", "/camera/front"],
      });
    });
    expect(result.current.streams).toEqual(["/camera/front"]);

    let cleanupBack: () => void = () => undefined;
    act(() => {
      cleanupBack = result.current.register({
        datasetName: "dataset",
        sampleId: "sample-back",
        streams: ["/camera/back", "/lidar/points", "/camera/front"],
      });
    });
    expect(result.current.streams).toEqual([
      "/camera/back",
      "/camera/front",
      "/lidar/points",
    ]);

    act(() => {
      cleanupFront();
    });
    expect(result.current.streams).toEqual([
      "/camera/back",
      "/camera/front",
      "/lidar/points",
    ]);

    act(() => {
      cleanupBack();
    });
    expect(result.current.streams).toEqual([]);
  });

  it("persists the selected stream stream per dataset with auto as the default", async () => {
    localStorage.setItem(
      "episode-grid-preview-image-stream:dataset",
      JSON.stringify("/camera/front"),
    );

    const { result } = renderHook(() =>
      useEpisodeGridSelectedStream("dataset"),
    );

    await waitFor(() => {
      expect(result.current[0]).toBe("/camera/front");
    });

    act(() => {
      result.current[1]("/camera/back");
    });

    expect(result.current[0]).toBe("/camera/back");
    expect(
      localStorage.getItem("episode-grid-preview-image-stream:dataset"),
    ).toBe(JSON.stringify("/camera/back"));
  });

  it("uses auto when no dataset is available", () => {
    const { result } = renderHook(() =>
      useEpisodeGridSelectedStream(undefined),
    );

    expect(result.current[0]).toBe(EPISODE_GRID_STREAM_AUTO);
  });
});
