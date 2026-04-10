/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMcapTimelineIndex } from "./useMcapTimelineIndex";

const { fetchMcapTimelineMock } = vi.hoisted(() => ({
  fetchMcapTimelineMock: vi.fn(),
}));

vi.mock("./api", () => ({
  fetchMcapTimeline: fetchMcapTimelineMock,
}));

const FIRST_TIMELINE = {
  sceneId: "scene-1",
  timeline: {
    timestampSource: "log_time" as const,
    timestampsNs: [10, 20],
    streams: [
      {
        streamId: "/camera/front",
        timestampsNs: [10, 20],
      },
    ],
  },
};

const SECOND_TIMELINE = {
  sceneId: "scene-2",
  timeline: {
    ...FIRST_TIMELINE.timeline,
    timestampsNs: [30, 40],
    streams: [
      {
        streamId: "/camera/rear",
        timestampsNs: [30, 40],
      },
    ],
  },
};

describe("useMcapTimelineIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the shared playback timeline and exposes derived fields", async () => {
    fetchMcapTimelineMock.mockResolvedValue(FIRST_TIMELINE);

    const { result } = renderHook(() =>
      useMcapTimelineIndex({
        datasetId: "dataset-1",
        sampleId: "sample-1",
        request: {
          mediaField: "mcap_path",
          streamIds: ["/camera/front"],
        },
      })
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.data).toEqual(FIRST_TIMELINE);
    });

    expect(result.current.timeline?.timestampsNs).toEqual([10, 20]);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("reloads when the sample identity changes", async () => {
    fetchMcapTimelineMock
      .mockResolvedValueOnce(FIRST_TIMELINE)
      .mockResolvedValueOnce(SECOND_TIMELINE);

    const { result, rerender } = renderHook(
      ({ datasetId, sampleId, streamIds }) =>
        useMcapTimelineIndex({
          datasetId,
          sampleId,
          request: {
            mediaField: "mcap_path",
            streamIds,
          },
        }),
      {
        initialProps: {
          datasetId: "dataset-1",
          sampleId: "sample-1",
          streamIds: ["/camera/front"],
        },
      }
    );

    await waitFor(() => {
      expect(result.current.timeline?.timestampsNs).toEqual([10, 20]);
    });

    rerender({
      datasetId: "dataset-2",
      sampleId: "sample-2",
      streamIds: ["/camera/rear"],
    });

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.timeline?.timestampsNs).toEqual([30, 40]);
    });
  });

  it("captures fetch errors and supports explicit reset", async () => {
    fetchMcapTimelineMock.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() =>
      useMcapTimelineIndex({
        datasetId: "dataset-1",
        sampleId: "sample-1",
        request: {
          mediaField: "mcap_path",
          streamIds: ["/camera/front"],
        },
      })
    );

    await waitFor(() => {
      expect(result.current.error?.message).toBe("boom");
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
