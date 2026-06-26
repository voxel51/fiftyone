import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserAnnotationProvider, PointLabel } from "../providers";
import { SAM2BrowserAnnotationAgent } from "./SAM2BrowserAnnotationAgent";
import {
  AgentTaskType,
  type AnnotationContext,
  InferenceCapability,
  SampleDescriptor,
} from "./types";
import { encodeMaskData } from "@fiftyone/lighter/src/utils/maskEncoding";

const _DATASET_ID = "dataset-id";
const _SAMPLE_ID = "sample-id";
const _MEDIA_URL = "https://image-host.com/media-path";

const makeContext = (
  overrides: Partial<AnnotationContext> = {},
): AnnotationContext => {
  return {
    sampleDescriptor: {
      datasetId: _DATASET_ID,
      sampleId: _SAMPLE_ID,
      mediaUrl: _MEDIA_URL,
    },
    taskType: AgentTaskType.SEGMENT,
    ...overrides,
  };
};

const makeProviderResult = (overrides: Record<string, unknown> = {}) => {
  return {
    mask: new Float32Array([0.1, 0.9, 0.8, 0.2]),
    maskWidth: 2,
    maskHeight: 2,
    bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    ...overrides,
  };
};

const makeProvider = () => {
  const mock = {
    initialize: vi.fn().mockResolvedValue(undefined),
    infer: vi.fn(),
    abort: vi.fn(),
    dispose: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(false),
  };

  // wire up interactions between initialize/isInitialized
  mock.initialize.mockImplementation(() => {
    mock.isInitialized.mockReturnValue(true);
    return Promise.resolve();
  });

  // wire up interactions between dispose/isInitialized
  mock.dispose.mockImplementation(() => {
    mock.isInitialized.mockReturnValue(false);
  });

  return mock as unknown as BrowserAnnotationProvider & {
    initialize: ReturnType<typeof vi.fn>;
    infer: ReturnType<typeof vi.fn>;
    abort: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    isInitialized: ReturnType<typeof vi.fn>;
  };
};

describe("SAM2BrowserAnnotationAgent", () => {
  let agent: SAM2BrowserAnnotationAgent;
  let provider: ReturnType<typeof makeProvider>;

  beforeEach(() => {
    provider = makeProvider();
    agent = new SAM2BrowserAnnotationAgent(() => provider);
  });

  describe("infer", () => {
    it("should initialize the provider on the first call", async () => {
      provider.infer.mockResolvedValue(makeProviderResult());

      await agent.infer(makeContext());

      expect(provider.initialize).toHaveBeenCalledOnce();
    });

    it("should not re-initialize on subsequent calls", async () => {
      provider.infer.mockResolvedValue(makeProviderResult());

      await agent.infer(makeContext());
      await agent.infer(makeContext());

      expect(provider.initialize).toHaveBeenCalledOnce();
    });

    it("should throw if mediaUrl has not been set", async () => {
      const freshAgent = new SAM2BrowserAnnotationAgent(() => makeProvider());

      await expect(
        freshAgent.infer({
          ...makeContext(),
          sampleDescriptor: {
            datasetId: _DATASET_ID,
            sampleId: _SAMPLE_ID,
          } as SampleDescriptor,
        }),
      ).rejects.toThrow("Missing media url");
    });

    it("should pass the mediaUrl provided in the context", async () => {
      provider.infer.mockResolvedValue(makeProviderResult());

      await agent.infer(makeContext());

      expect(provider.infer).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: _MEDIA_URL }),
      );
    });

    it("should convert positive and negative points to PromptPoints", async () => {
      provider.infer.mockResolvedValue(makeProviderResult());

      await agent.infer(
        makeContext({
          positivePoints: [
            [0.5, 0.3],
            [0.7, 0.1],
          ],
          negativePoints: [[0.2, 0.8]],
        }),
      );

      expect(provider.infer).toHaveBeenCalledWith({
        imageUrl: _MEDIA_URL,
        points: [
          { x: 0.5, y: 0.3, label: PointLabel.POSITIVE },
          { x: 0.7, y: 0.1, label: PointLabel.POSITIVE },
          { x: 0.2, y: 0.8, label: PointLabel.NEGATIVE },
        ],
      });
    });

    it("should send an empty points array when no prompts are provided", async () => {
      provider.infer.mockResolvedValue(makeProviderResult());

      await agent.infer(makeContext());

      expect(provider.infer).toHaveBeenCalledWith({
        imageUrl: _MEDIA_URL,
        points: [],
      });
    });

    it("should return a sync segmentation result", async () => {
      const providerResult = makeProviderResult();
      provider.infer.mockResolvedValue(providerResult);

      const result = await agent.infer(makeContext());

      const binary = new Uint8Array(providerResult.mask.length);
      for (let i = 0; i < providerResult.mask.length; i++) {
        binary[i] = providerResult.mask[i] > 0.5 ? 1 : 0;
      }
      const expectedMask = await encodeMaskData(binary, [
        providerResult.maskHeight,
        providerResult.maskWidth,
      ]);
      expect(result).toEqual({
        type: "sync",
        taskType: AgentTaskType.SEGMENT,
        response: {
          detections: [
            {
              mask: expectedMask,
              mask_width: 2,
              mask_height: 2,
              bounding_box: [0.1, 0.2, 0.3, 0.4],
            },
          ],
        },
      });
    });

    it("should propagate provider initialization errors", async () => {
      provider.initialize.mockRejectedValue(
        new Error("Missing browser APIs: WASM SIMD"),
      );

      await expect(agent.infer(makeContext())).rejects.toThrow(
        "Missing browser APIs: WASM SIMD",
      );
    });

    it("should allow retry after initialization failure", async () => {
      provider.initialize
        .mockRejectedValueOnce(new Error("init failed"))
        .mockResolvedValueOnce(undefined);
      provider.infer.mockResolvedValue(makeProviderResult());

      await expect(agent.infer(makeContext())).rejects.toThrow("init failed");

      const result = await agent.infer(makeContext());
      expect(result.type).toBe("sync");
      expect(provider.initialize).toHaveBeenCalledTimes(2);
    });

    it("should propagate provider inference errors", async () => {
      provider.infer.mockRejectedValue(new Error("Worker error"));

      await expect(agent.infer(makeContext())).rejects.toThrow("Worker error");
    });
  });

  describe("mask normalization", () => {
    const inferAndDecode = async (mask: Float32Array) => {
      const providerResult = makeProviderResult({
        mask,
        maskWidth: mask.length,
        maskHeight: 1,
      });
      provider.infer.mockResolvedValue(providerResult);
      return agent.infer(makeContext());
    };

    const expectMaskMatches = async (
      result: Awaited<ReturnType<typeof agent.infer>>,
      expected: number[],
    ) => {
      const encoded = await encodeMaskData(new Uint8Array(expected), [
        1,
        expected.length,
      ]);
      if (result.type !== "sync") throw new Error("expected sync result");
      expect(result.response.detections[0].mask).toBe(encoded);
    };

    it("thresholds values strictly greater than 0.5 to 1", async () => {
      // 0.5 itself is NOT > 0.5, so it becomes 0
      const result = await inferAndDecode(
        new Float32Array([0.5, 0.50001, 0.499, 0.5]),
      );
      await expectMaskMatches(result, [0, 1, 0, 0]);
    });

    it("maps negative values to 0", async () => {
      const result = await inferAndDecode(
        new Float32Array([-1, -0.0001, -100, -1e-8]),
      );
      await expectMaskMatches(result, [0, 0, 0, 0]);
    });

    it("maps values in (0.5, 1] to 1 and [0, 0.5] to 0", async () => {
      const result = await inferAndDecode(
        new Float32Array([0, 0.25, 0.5, 0.75, 1.0]),
      );
      await expectMaskMatches(result, [0, 0, 0, 1, 1]);
    });

    it("throws when mask contains NaN", async () => {
      const providerResult = makeProviderResult({
        mask: new Float32Array([0.1, NaN, 0.9, 0.2]),
      });
      provider.infer.mockResolvedValue(providerResult);

      await expect(agent.infer(makeContext())).rejects.toThrow(
        /Invalid float at index 1/,
      );
    });

    it("throws when mask contains Infinity", async () => {
      const providerResult = makeProviderResult({
        mask: new Float32Array([0.1, 0.2, Infinity, 0.4]),
      });
      provider.infer.mockResolvedValue(providerResult);

      await expect(agent.infer(makeContext())).rejects.toThrow(
        /Invalid float at index 2/,
      );
    });

    it("throws when mask contains -Infinity", async () => {
      const providerResult = makeProviderResult({
        mask: new Float32Array([0.1, -Infinity, 0.9]),
      });
      provider.infer.mockResolvedValue(providerResult);

      await expect(agent.infer(makeContext())).rejects.toThrow(
        /Invalid float at index 1/,
      );
    });
  });

  describe("listSupportedTasks", () => {
    it("should return only SEGMENT", async () => {
      const tasks = await agent.listSupportedTasks();
      expect(tasks).toEqual([AgentTaskType.SEGMENT]);
    });
  });

  describe("listInferenceCapabilities", () => {
    it("should return point capabilities for SEGMENT", async () => {
      const caps = await agent.listInferenceCapabilities(AgentTaskType.SEGMENT);
      expect(caps).toEqual([
        InferenceCapability.POSITIVE_POINT,
        InferenceCapability.NEGATIVE_POINT,
      ]);
    });

    it("should return empty for non-SEGMENT tasks", async () => {
      expect(
        await agent.listInferenceCapabilities(AgentTaskType.DETECT),
      ).toEqual([]);
      expect(
        await agent.listInferenceCapabilities(AgentTaskType.CLASSIFY),
      ).toEqual([]);
      expect(
        await agent.listInferenceCapabilities(AgentTaskType.INFER),
      ).toEqual([]);
    });
  });

  describe("getModelMetadata", () => {
    it("should return SAM2 metadata for SEGMENT", async () => {
      const meta = await agent.getModelMetadata(AgentTaskType.SEGMENT);
      expect(meta).toEqual({ name: "SAM2 Tiny", version: "hiera-tiny-onnx" });
    });

    it("should return null for non-SEGMENT tasks", async () => {
      expect(await agent.getModelMetadata(AgentTaskType.DETECT)).toBeNull();
    });
  });

  describe("abort", () => {
    it("should forward to the provider", async () => {
      await agent.abort();
      expect(provider.abort).toHaveBeenCalledOnce();
    });
  });

  describe("dispose", () => {
    it("should dispose the provider", () => {
      agent.dispose();
      expect(provider.dispose).toHaveBeenCalledOnce();
    });

    it("should allow re-initialization after dispose", async () => {
      provider.infer.mockResolvedValue(makeProviderResult());

      await agent.infer(makeContext());
      agent.dispose();
      await agent.infer(makeContext());

      expect(provider.initialize).toHaveBeenCalledTimes(2);
    });
  });

  describe("dispose during initialization", () => {
    it("should not mark as initialized if disposed before init resolves", async () => {
      let resolveInit: () => void;
      provider.initialize.mockReturnValue(
        new Promise<void>((r) => {
          resolveInit = r;
        }),
      );
      // Mirror real provider: infer throws when worker is gone
      provider.infer.mockImplementation(() => {
        if (!provider.isInitialized()) {
          throw new Error("Provider is not initialized");
        }
        return Promise.resolve(makeProviderResult());
      });

      const inferPromise = agent.infer(makeContext());

      // dispose while initialize() is still pending
      agent.dispose();

      // now let initialize resolve — provider is already disposed
      resolveInit!();

      // infer should fail because provider is disposed
      await expect(inferPromise).rejects.toThrow("Provider is not initialized");
    });

    it("should re-initialize on next infer after dispose during init", async () => {
      let resolveInit: () => void;
      provider.initialize.mockReturnValueOnce(
        new Promise<void>((r) => {
          resolveInit = r;
        }),
      );
      provider.infer.mockResolvedValue(makeProviderResult());

      const firstInfer = agent.infer(makeContext());

      // dispose mid-init
      agent.dispose();
      resolveInit!();
      await firstInfer.catch(() => {});

      // restore provider to working state
      provider.isInitialized.mockReturnValue(true);
      provider.initialize.mockResolvedValue(undefined);

      await agent.infer(makeContext());

      expect(provider.initialize).toHaveBeenCalledTimes(2);
    });
  });

  describe("concurrent initialization", () => {
    it("should coalesce concurrent infer calls into a single init", async () => {
      let resolveInit: () => void;
      provider.initialize.mockReturnValue(
        new Promise<void>((r) => {
          resolveInit = r;
        }),
      );
      provider.infer.mockResolvedValue(makeProviderResult());

      const p1 = agent.infer(makeContext());
      const p2 = agent.infer(makeContext());

      resolveInit!();
      await Promise.all([p1, p2]);

      expect(provider.initialize).toHaveBeenCalledOnce();
    });
  });
});
