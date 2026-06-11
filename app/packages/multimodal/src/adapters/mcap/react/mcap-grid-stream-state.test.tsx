import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MCAP_GRID_STREAM_AUTO,
  __resetMcapGridStreamStateForTests,
  useRegisterMcapGridStreamTopics,
  useMcapGridSelectedStreamTopic,
  useMcapGridStreamTopics,
} from "./mcap-grid-stream-state";

describe("mcap-grid-stream-state", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetMcapGridStreamStateForTests();
  });

  afterEach(() => {
    localStorage.clear();
    __resetMcapGridStreamStateForTests();
  });

  it("aggregates stream topics across mounted samples and removes them on cleanup", () => {
    const { result } = renderHook(() => ({
      register: useRegisterMcapGridStreamTopics(),
      topics: useMcapGridStreamTopics("dataset"),
    }));

    expect(result.current.topics).toEqual([]);

    let cleanupFront: () => void = () => undefined;
    act(() => {
      cleanupFront = result.current.register({
        datasetName: "dataset",
        sampleId: "sample-front",
        topics: ["/camera/front", "/camera/front"],
      });
    });
    expect(result.current.topics).toEqual(["/camera/front"]);

    let cleanupBack: () => void = () => undefined;
    act(() => {
      cleanupBack = result.current.register({
        datasetName: "dataset",
        sampleId: "sample-back",
        topics: ["/camera/back", "/lidar/points", "/camera/front"],
      });
    });
    expect(result.current.topics).toEqual([
      "/camera/back",
      "/camera/front",
      "/lidar/points",
    ]);

    act(() => {
      cleanupFront();
    });
    expect(result.current.topics).toEqual([
      "/camera/back",
      "/camera/front",
      "/lidar/points",
    ]);

    act(() => {
      cleanupBack();
    });
    expect(result.current.topics).toEqual([]);
  });

  it("persists the selected stream topic per dataset with auto as the default", async () => {
    localStorage.setItem(
      "mcap-grid-preview-image-topic:dataset",
      JSON.stringify("/camera/front")
    );

    const { result } = renderHook(() =>
      useMcapGridSelectedStreamTopic("dataset")
    );

    await waitFor(() => {
      expect(result.current[0]).toBe("/camera/front");
    });

    act(() => {
      result.current[1]("/camera/back");
    });

    expect(result.current[0]).toBe("/camera/back");
    expect(localStorage.getItem("mcap-grid-preview-image-topic:dataset")).toBe(
      JSON.stringify("/camera/back")
    );
  });

  it("uses auto when no dataset is available", () => {
    const { result } = renderHook(() => useMcapGridSelectedStreamTopic(null));

    expect(result.current[0]).toBe(MCAP_GRID_STREAM_AUTO);
  });
});
