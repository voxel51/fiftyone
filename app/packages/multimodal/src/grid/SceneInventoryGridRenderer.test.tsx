/**
 * @vitest-environment jsdom
 */

import { create, toBinary } from "@bufbuild/protobuf";
import type { SampleRendererProps } from "@fiftyone/plugins";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MultimodalFetchBody,
  MultimodalFetchFunction,
} from "../client";
import {
  SceneInventorySchema,
  TimeTrackRole,
  TimeTrackType,
} from "../schemas/v1";
import { SceneInventoryGridRenderer } from "./SceneInventoryGridRenderer";

let activeFetch: MultimodalFetchFunction | undefined;

vi.mock("@fiftyone/utilities", () => ({
  getFetchFunction: () => {
    if (!activeFetch) {
      throw new Error("No active fetch mock");
    }
    return activeFetch;
  },
}));

interface FetchCall {
  readonly method: string;
  readonly path: string;
  readonly body: MultimodalFetchBody | undefined;
  readonly result: "arrayBuffer" | undefined;
}

describe("SceneInventoryGridRenderer", () => {
  beforeEach(() => {
    activeFetch = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it("fetches scene inventory and renders compact inventory facts", async () => {
    const scene = create(SceneInventorySchema, {
      inventoryId: "inventory-1",
      inventoryVersion: "v1",
      sceneId: "mock-scene:sample-1",
      sourceFormat: "mock",
      streams: [
        {
          displayName: "Front camera",
          metadata: { kind: "image" },
          payload: { encoding: "image/jpeg" },
          recordCount: "24",
          streamId: "camera.front",
        },
        {
          displayName: "Rear camera",
          metadata: { kind: "image" },
          payload: { encoding: "image/jpeg" },
          recordCount: "24",
          streamId: "camera.rear",
        },
        {
          displayName: "Top lidar",
          metadata: { kind: "point-cloud" },
          payload: { encoding: "point-cloud/xyz" },
          recordCount: "12",
          streamId: "lidar.top",
        },
      ],
      timeTracks: [
        {
          displayName: "Sample index",
          role: TimeTrackRole.SAMPLE_INDEX,
          timeTrackId: "sample.index",
          type: TimeTrackType.SEQUENCE,
        },
        {
          displayName: "Capture time",
          role: TimeTrackRole.CAPTURE_TIME,
          timeTrackId: "capture.time",
          type: TimeTrackType.TIMESTAMP_NS,
        },
      ],
    });
    const { calls, fetch } = createFetchMock({
      "/multimodal/scene-inventory": toBinary(
        SceneInventorySchema,
        scene
      ).buffer,
    });
    activeFetch = fetch;

    render(<SceneInventoryGridRenderer ctx={createRendererCtx()} />);

    await waitFor(() => {
      expect(screen.getByText("mock-scene:sample-1")).toBeTruthy();
    });

    expect(screen.getByText("mock / v1")).toBeTruthy();
    expect(screen.getByText("3 streams")).toBeTruthy();
    expect(screen.getByText("2 time tracks")).toBeTruthy();
    expect(screen.getByText("Front camera")).toBeTruthy();
    expect(screen.getByText("Top lidar")).toBeTruthy();
    expect(screen.getAllByText("image / image/jpeg / 24 records")).toHaveLength(
      2
    );
    expect(calls).toEqual([
      {
        body: { dataset_id: "dataset-1", sample_id: "sample-1" },
        method: "POST",
        path: "/multimodal/scene-inventory",
        result: "arrayBuffer",
      },
    ]);
  });
});

function createRendererCtx(): SampleRendererProps["ctx"] {
  return {
    dataset: { datasetId: "dataset-1" },
    media: {
      extension: "mcap",
      field: "filepath",
      isNative: false,
      mediaType: null,
      mimeType: null,
      path: "/tmp/sample.mcap",
      url: "/media/sample.mcap",
    },
    sample: {
      sample: {
        _id: "sample-1",
        filepath: "/tmp/sample.mcap",
      },
    },
    schema: {},
    surface: "grid",
  } as unknown as SampleRendererProps["ctx"];
}

function createFetchMock(
  responses: Readonly<Record<string, ArrayBufferLike>>
): { calls: FetchCall[]; fetch: MultimodalFetchFunction } {
  const calls: FetchCall[] = [];
  const fetch: MultimodalFetchFunction = async <
    Body extends MultimodalFetchBody | undefined,
    Result
  >(
    method: string,
    path: string,
    body?: Body,
    result?: "arrayBuffer"
  ): Promise<Result> => {
    calls.push({ body, method, path, result });

    const response = responses[path];
    if (!response) {
      throw new Error(`No mock response for ${path}`);
    }

    return response as Result;
  };

  return { calls, fetch };
}
