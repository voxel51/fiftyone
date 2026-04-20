/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMultimodalWorkspace } from "./useMultimodalWorkspace";

const { fetchMultimodalWorkspaceMock } = vi.hoisted(() => ({
  fetchMultimodalWorkspaceMock: vi.fn(),
}));

vi.mock("./api", () => ({
  fetchMultimodalWorkspace: fetchMultimodalWorkspaceMock,
}));

const FIRST_WORKSPACE = {
  catalog: {
    sceneId: "scene-1",
    datasetId: "dataset-1",
    sampleId: "sample-1",
    mediaField: "filepath",
    mediaPath: "/tmp/scene-1.mcap",
    sourceKind: "mcap",
    catalogVersion: "multimodal-workspace-v1",
    timeRange: { startNs: 1, endNs: 2 },
    streams: [],
    frames: [],
    transforms: [],
    locationTopics: [],
  },
  renderingPlan: {
    sceneId: "scene-1",
    mediaField: "filepath",
    sync: {
      timestampSource: "header.stamp",
      fallback: "log_time",
      mode: "nearest",
    },
    panels: [],
  },
} as const;

describe("useMultimodalWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and exposes the catalog and rendering plan", async () => {
    fetchMultimodalWorkspaceMock.mockResolvedValue(FIRST_WORKSPACE);

    const { result } = renderHook(() =>
      useMultimodalWorkspace({
        datasetId: "dataset-1",
        sampleId: "sample-1",
        mediaField: "filepath",
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.catalog?.sceneId).toBe("scene-1");
    expect(result.current.renderingPlan?.sceneId).toBe("scene-1");
  });

  it("surfaces fetch failures", async () => {
    fetchMultimodalWorkspaceMock.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() =>
      useMultimodalWorkspace({
        datasetId: "dataset-1",
        sampleId: "sample-1",
        mediaField: "filepath",
      })
    );

    await waitFor(() => {
      expect(result.current.error?.message).toBe("boom");
    });
  });
});
