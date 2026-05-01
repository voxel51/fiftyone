import { create, toBinary } from "@bufbuild/protobuf";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackPlanSchema, SceneInventorySchema } from "../schemas/v1";
import {
  createMultimodalClient,
  DEFAULT_MULTIMODAL_QUERY_ROUTES,
  type MultimodalFetchBody,
  type MultimodalFetchFunction,
} from "./index";

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
  readonly headers: Record<string, string> | undefined;
}

describe("multimodal client", () => {
  beforeEach(() => {
    activeFetch = undefined;
  });

  it("fetches and decodes typed query artifacts", async () => {
    const scene = create(SceneInventorySchema, {
      inventoryId: "inventory-1",
      sceneId: "scene-1",
      sourceFormat: "source-format",
      inventoryVersion: "v1",
    });
    const plan = create(PlaybackPlanSchema, {
      planId: "plan-1",
      sceneId: "scene-1",
      sourceInventoryId: "inventory-1",
    });

    const { calls, fetch } = createFetchMock({
      "/multimodal/scene-inventory": toBinary(SceneInventorySchema, scene)
        .buffer,
      "/multimodal/playback-plan": toBinary(PlaybackPlanSchema, plan).buffer,
    });
    activeFetch = fetch;
    const client = createMultimodalClient({
      routes: DEFAULT_MULTIMODAL_QUERY_ROUTES,
    });

    const decodedScene = await client.queries.getSceneInventory({
      datasetId: "dataset-1",
      sampleId: "sample-1",
    });
    const decodedPlan = await client.queries.getPlaybackPlan({
      inventoryId: "inventory-1",
    });

    expect(decodedScene.inventoryId).toBe("inventory-1");
    expect(decodedPlan.sourceInventoryId).toBe("inventory-1");
    expect(calls.map((call) => call.result)).toEqual([
      "arrayBuffer",
      "arrayBuffer",
    ]);
    expect(calls.map((call) => call.body)).toEqual([
      { dataset_id: "dataset-1", sample_id: "sample-1" },
      { inventory_id: "inventory-1" },
    ]);
  });
});

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
    result?: "arrayBuffer",
    _retries?: number,
    _retryCodes?: number[],
    _errorHandler?: (response: Response) => void | Promise<void>,
    headers?: Record<string, string>
  ): Promise<Result> => {
    calls.push({ body, headers, method, path, result });

    const response = responses[path];
    if (!response) {
      throw new Error(`No mock response for ${path}`);
    }

    return response as Result;
  };

  return { calls, fetch };
}
