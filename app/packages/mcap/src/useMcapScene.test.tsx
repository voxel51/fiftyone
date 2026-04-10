/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMcapScene } from "./useMcapScene";

const { fetchMcapSceneMock } = vi.hoisted(() => ({
  fetchMcapSceneMock: vi.fn(),
}));

vi.mock("./api", () => ({
  fetchMcapScene: fetchMcapSceneMock,
}));

const FIRST_SCENE = {
  scene: {
    sceneId: "scene-1",
    datasetId: "dataset-1",
    sampleId: "sample-1",
    mediaField: "mcap_path",
    mediaPath: "/tmp/one.mcap",
    timeRange: { startNs: 1, endNs: 2 },
    streams: [],
  },
  playbackPlan: {
    sceneId: "scene-1",
    sync: {
      timestampSource: "header.stamp" as const,
      fallback: "log_time" as const,
      mode: "nearest" as const,
    },
    panels: [],
    sidebars: {
      left: "panel_config" as const,
      right: "stream_metadata" as const,
    },
  },
};

const SECOND_SCENE = {
  ...FIRST_SCENE,
  scene: {
    ...FIRST_SCENE.scene,
    sceneId: "scene-2",
    datasetId: "dataset-2",
    sampleId: "sample-2",
    mediaPath: "/tmp/two.mcap",
  },
  playbackPlan: {
    ...FIRST_SCENE.playbackPlan,
    sceneId: "scene-2",
  },
};

describe("useMcapScene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the scene-open payload and exposes derived fields", async () => {
    fetchMcapSceneMock.mockResolvedValue(FIRST_SCENE);

    const { result } = renderHook(() =>
      useMcapScene({
        datasetId: "dataset-1",
        sampleId: "sample-1",
        mediaField: "mcap_path",
      })
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.data).toEqual(FIRST_SCENE);
    });

    expect(result.current.scene?.sceneId).toBe("scene-1");
    expect(result.current.playbackPlan?.sceneId).toBe("scene-1");
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("resets and reloads when the sample identity changes", async () => {
    fetchMcapSceneMock
      .mockResolvedValueOnce(FIRST_SCENE)
      .mockResolvedValueOnce(SECOND_SCENE);

    const { result, rerender } = renderHook(
      ({ datasetId, sampleId }) =>
        useMcapScene({
          datasetId,
          sampleId,
          mediaField: "mcap_path",
        }),
      {
        initialProps: {
          datasetId: "dataset-1",
          sampleId: "sample-1",
        },
      }
    );

    await waitFor(() => {
      expect(result.current.scene?.sceneId).toBe("scene-1");
    });

    rerender({ datasetId: "dataset-2", sampleId: "sample-2" });

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.scene?.sceneId).toBe("scene-2");
    });
  });

  it("captures fetch errors and supports explicit reset", async () => {
    fetchMcapSceneMock.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() =>
      useMcapScene({
        datasetId: "dataset-1",
        sampleId: "sample-1",
        mediaField: "mcap_path",
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
