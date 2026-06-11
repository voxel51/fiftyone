import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MCAP_GRID_STREAM_AUTO,
  __resetMcapGridStreamStateForTests,
  registerMcapGridImageTopics,
  useMcapGridImageTopics,
  useMcapGridSelectedImageTopic,
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

  it("aggregates image topics across mounted samples and removes them on cleanup", () => {
    const { result } = renderHook(() => useMcapGridImageTopics("dataset"));

    expect(result.current).toEqual([]);

    let cleanupFront: () => void = () => undefined;
    act(() => {
      cleanupFront = registerMcapGridImageTopics({
        datasetName: "dataset",
        sampleId: "sample-front",
        topics: ["/camera/front", "/camera/front"],
      });
    });
    expect(result.current).toEqual(["/camera/front"]);

    let cleanupBack: () => void = () => undefined;
    act(() => {
      cleanupBack = registerMcapGridImageTopics({
        datasetName: "dataset",
        sampleId: "sample-back",
        topics: ["/camera/back", "/camera/front"],
      });
    });
    expect(result.current).toEqual(["/camera/back", "/camera/front"]);

    act(() => {
      cleanupFront();
    });
    expect(result.current).toEqual(["/camera/back", "/camera/front"]);

    act(() => {
      cleanupBack();
    });
    expect(result.current).toEqual([]);
  });

  it("persists the selected image topic per dataset with auto as the default", async () => {
    localStorage.setItem(
      "mcap-grid-preview-image-topic:dataset",
      JSON.stringify("/camera/front")
    );

    const { result } = renderHook(() =>
      useMcapGridSelectedImageTopic("dataset")
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
    const { result } = renderHook(() => useMcapGridSelectedImageTopic(null));

    expect(result.current[0]).toBe(MCAP_GRID_STREAM_AUTO);
  });
});
