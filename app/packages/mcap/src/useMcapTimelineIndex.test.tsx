/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMultimodalTimelineIndex } from "./useMultimodalTimelineIndex";

const { fetchMultimodalTimelineMock } = vi.hoisted(() => ({
  fetchMultimodalTimelineMock: vi.fn(),
}));

vi.mock("./api", () => ({
  fetchMultimodalTimeline: fetchMultimodalTimelineMock,
}));

describe("useMultimodalTimelineIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the timeline index payload", async () => {
    fetchMultimodalTimelineMock.mockResolvedValue({
      sceneId: "scene-1",
      timestampSource: "header.stamp",
      timestampsNs: [10, 20],
      streams: [
        {
          streamId: "/camera/front",
          timestampsNs: [10, 20],
          samples: [
            {
              timestampNs: 10,
              logTimeNs: 100,
              publishTimeNs: 101,
            },
            {
              timestampNs: 20,
              logTimeNs: 200,
              publishTimeNs: 201,
            },
          ],
        },
      ],
    });

    const { result } = renderHook(() =>
      useMultimodalTimelineIndex({
        datasetId: "dataset-1",
        sampleId: "sample-1",
        request: {
          mediaField: "filepath",
          streamIds: ["/camera/front"],
        },
      })
    );

    await waitFor(() => {
      expect(result.current.timeline?.sceneId).toBe("scene-1");
    });
  });
});
