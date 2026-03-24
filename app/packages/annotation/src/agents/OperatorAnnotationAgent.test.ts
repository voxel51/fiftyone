import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@fiftyone/utilities", () => ({
  getFetchFunction: vi.fn(),
  getEventSource: vi.fn(),
}));

import { getFetchFunction, getEventSource } from "@fiftyone/utilities";
import { OperatorAnnotationAgent } from "./OperatorAnnotationAgent";
import {
  AgentTaskType,
  type AnnotationContext,
  InferenceResultProxy,
} from "./types";

const OPERATOR_URI = "@test/my-operator";

function makeContext(
  overrides: Partial<AnnotationContext> = {}
): AnnotationContext {
  return {
    sampleDescriptor: { datasetId: "ds-1", sampleId: "s-1" },
    taskType: AgentTaskType.SEGMENT,
    ...overrides,
  };
}

function makeResolveTypeResponse(
  properties: Record<string, { default?: unknown }> = {}
) {
  return { type: { properties } };
}

describe("OperatorAnnotationAgent", () => {
  let agent: OperatorAnnotationAgent<InferenceResultProxy>;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    vi.mocked(getFetchFunction).mockReturnValue(mockFetch as any);
    agent = new OperatorAnnotationAgent(OPERATOR_URI);
  });

  describe("infer", () => {
    it("should return a sync result when the operator is not delegated", async () => {
      mockFetch.mockResolvedValue({
        result: { result: { data: "mask-data" } },
      });

      const result = await agent.infer(makeContext());

      expect(result).toEqual({
        type: "sync",
        taskType: AgentTaskType.SEGMENT,
        response: { data: "mask-data" },
      });
    });

    it("should return an async result when the operator is delegated", async () => {
      mockFetch.mockResolvedValue({
        delegated: true,
        result: { id: "exec-1" },
      });

      const result = await agent.infer(makeContext());

      expect(result).toEqual({ type: "async", sessionId: "exec-1" });
    });

    it("should throw on a top-level error", async () => {
      mockFetch.mockResolvedValue({ error: "server exploded" });

      await expect(agent.infer(makeContext())).rejects.toThrow(
        "server exploded"
      );
    });

    it("should throw on a top-level error_message", async () => {
      mockFetch.mockResolvedValue({ error_message: "bad input" });

      await expect(agent.infer(makeContext())).rejects.toThrow("bad input");
    });

    it("should throw when delegated but no executor id", async () => {
      mockFetch.mockResolvedValue({ delegated: true });

      await expect(agent.infer(makeContext())).rejects.toThrow(
        /no operator id/i
      );
    });

    it("should send the correct request body", async () => {
      mockFetch.mockResolvedValue({ result: { result: {} } });
      const ctx = makeContext({ textPrompt: "cat" });

      await agent.infer(ctx);

      expect(mockFetch).toHaveBeenCalledWith("POST", "/operators/execute", {
        operator_uri: OPERATOR_URI,
        params: ctx,
      });
    });
  });

  describe("listSupportedTasks", () => {
    it("should return tasks from the schema default", async () => {
      mockFetch.mockResolvedValue(
        makeResolveTypeResponse({
          supported_tasks: { default: ["segment", "detect"] },
        })
      );

      const tasks = await agent.listSupportedTasks();

      expect(tasks).toEqual(["segment", "detect"]);
    });

    it("should return an empty array when property is missing", async () => {
      mockFetch.mockResolvedValue(makeResolveTypeResponse({}));

      const tasks = await agent.listSupportedTasks();

      expect(tasks).toEqual([]);
    });

    it("should call resolve-type with empty params", async () => {
      mockFetch.mockResolvedValue(makeResolveTypeResponse({}));

      await agent.listSupportedTasks();

      expect(mockFetch).toHaveBeenCalledWith(
        "POST",
        "/operators/resolve-type",
        {
          operator_uri: OPERATOR_URI,
          params: {},
          target: "inputs",
        }
      );
    });
  });

  describe("listInferenceCapabilities", () => {
    it("should return capabilities from schema", async () => {
      mockFetch.mockResolvedValue(
        makeResolveTypeResponse({
          inference_capabilities: {
            default: ["positivePoint", "roi"],
          },
        })
      );

      const caps = await agent.listInferenceCapabilities(AgentTaskType.SEGMENT);

      expect(caps).toEqual(["positivePoint", "roi"]);
    });

    it("should pass task in params to resolve-type", async () => {
      mockFetch.mockResolvedValue(makeResolveTypeResponse({}));

      await agent.listInferenceCapabilities(AgentTaskType.DETECT);

      expect(mockFetch).toHaveBeenCalledWith(
        "POST",
        "/operators/resolve-type",
        expect.objectContaining({
          params: { task: AgentTaskType.DETECT },
        })
      );
    });

    it("should return empty array when property is missing", async () => {
      mockFetch.mockResolvedValue(makeResolveTypeResponse({}));

      const caps = await agent.listInferenceCapabilities(AgentTaskType.SEGMENT);

      expect(caps).toEqual([]);
    });
  });

  describe("getModelMetadata", () => {
    it("should return metadata from schema", async () => {
      mockFetch.mockResolvedValue(
        makeResolveTypeResponse({
          model_metadata: {
            default: { name: "SAM2", version: "1.0" },
          },
        })
      );

      const meta = await agent.getModelMetadata(AgentTaskType.SEGMENT);

      expect(meta).toEqual({ name: "SAM2", version: "1.0" });
    });

    it("should return null when property is absent", async () => {
      mockFetch.mockResolvedValue(makeResolveTypeResponse({}));

      const meta = await agent.getModelMetadata(AgentTaskType.SEGMENT);

      expect(meta).toBeNull();
    });
  });

  // subscribe() is currently a no-op (todo) — re-enable when implemented
  describe.skip("unsubscribe", () => {
    it("should abort the controllers for the session", async () => {
      const callback = vi.fn();
      await agent.subscribe("session-1", callback);

      const signal = vi.mocked(getEventSource).mock.calls[0][2] as AbortSignal;
      expect(signal.aborted).toBe(false);

      await agent.unsubscribe("session-1");

      expect(signal.aborted).toBe(true);
    });

    it("should be a no-op for an unknown session", async () => {
      await agent.unsubscribe("nonexistent");
    });
  });

  // subscribe() is currently a no-op (todo) — re-enable when implemented
  describe.skip("abort", () => {
    it("should abort controllers", async () => {
      const callback = vi.fn();
      await agent.subscribe("session-1", callback);

      // Reset fetch mock to track only the abort call
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({});

      await agent.abort("session-1");

      // SSE stream should be closed
      const signal = vi.mocked(getEventSource).mock.calls[0][2] as AbortSignal;
      expect(signal.aborted).toBe(true);
    });
  });

  describe("validateOperator", () => {
    it("should succeed when all capabilities exist as schema properties", async () => {
      // First call: listSupportedTasks (no params)
      // Second + third calls: resolveInputSchema({task}) + listInferenceCapabilities({task})
      // They both call resolve-type, so we get 3 calls total for one task
      mockFetch
        .mockResolvedValueOnce(
          makeResolveTypeResponse({
            supported_tasks: { default: ["segment"] },
          })
        )
        // resolveInputSchema for validate + listInferenceCapabilities share params
        .mockResolvedValue(
          makeResolveTypeResponse({
            inference_capabilities: {
              default: ["positivePoint", "roi"],
            },
            positivePoint: {},
            roi: {},
          })
        );

      await expect(agent.validateOperator()).resolves.toBeUndefined();
    });

    it("should throw when a capability is missing from schema properties", async () => {
      mockFetch
        .mockResolvedValueOnce(
          makeResolveTypeResponse({
            supported_tasks: { default: ["segment"] },
          })
        )
        .mockResolvedValue(
          makeResolveTypeResponse({
            inference_capabilities: {
              default: ["positivePoint", "roi"],
            },
            positivePoint: {},
            // "roi" is missing
          })
        );

      await expect(agent.validateOperator()).rejects.toThrow(
        /missing required input property.*"roi".*task "segment"/i
      );
    });
  });

  describe("resolveInputSchema", () => {
    it("should throw when resolve-type response contains an error", async () => {
      mockFetch.mockResolvedValue({ error: "schema error" });

      await expect(agent.listSupportedTasks()).rejects.toThrow("schema error");
    });
  });
});
