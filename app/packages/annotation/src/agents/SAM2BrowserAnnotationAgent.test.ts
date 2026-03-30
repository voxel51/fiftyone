import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserAnnotationProvider } from "../providers";
import { SAM2BrowserAnnotationAgent } from "./SAM2BrowserAnnotationAgent";
import {
  AgentTaskType,
  type AnnotationContext,
  InferenceCapability,
} from "./types";

const PointLabel = { NEGATIVE: 0, POSITIVE: 1 } as const;

const makeContext = (
  overrides: Partial<AnnotationContext> = {}
): AnnotationContext => {
  return {
    sampleDescriptor: { datasetId: "ds-1", sampleId: "s-1" },
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
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    infer: vi.fn(),
    abort: vi.fn(),
    dispose: vi.fn(),
  } as unknown as BrowserAnnotationProvider & {
    initialize: ReturnType<typeof vi.fn>;
    infer: ReturnType<typeof vi.fn>;
    abort: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
};

describe("SAM2BrowserAnnotationAgent", () => {
  let agent: SAM2BrowserAnnotationAgent;
  let provider: ReturnType<typeof makeProvider>;
  const imageUrl = "https://media.test/sample.jpg";

  beforeEach(() => {
    provider = makeProvider();
    agent = new SAM2BrowserAnnotationAgent(provider);
    agent.setImageUrl(imageUrl);
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

    it("should throw if imageUrl has not been set", async () => {
      const freshAgent = new SAM2BrowserAnnotationAgent(makeProvider());

      await expect(freshAgent.infer(makeContext())).rejects.toThrow(
        "Must set imageUrl before calling infer()"
      );
    });

    it("should pass the imageUrl set via setImageUrl", async () => {
      provider.infer.mockResolvedValue(makeProviderResult());

      const newImageUrl = "https://media.test/other.jpg";
      agent.setImageUrl(newImageUrl);

      await agent.infer(makeContext());

      expect(provider.infer).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: newImageUrl })
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
        })
      );

      expect(provider.infer).toHaveBeenCalledWith({
        imageUrl,
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
        imageUrl,
        points: [],
      });
    });

    it("should return a sync segmentation result", async () => {
      const providerResult = makeProviderResult();
      provider.infer.mockResolvedValue(providerResult);

      const result = await agent.infer(makeContext());

      expect(result).toEqual({
        type: "sync",
        taskType: AgentTaskType.SEGMENT,
        response: {
          detections: [
            {
              mask: providerResult.mask,
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
        new Error("Missing browser APIs: WASM SIMD")
      );

      await expect(agent.infer(makeContext())).rejects.toThrow(
        "Missing browser APIs: WASM SIMD"
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
        await agent.listInferenceCapabilities(AgentTaskType.DETECT)
      ).toEqual([]);
      expect(
        await agent.listInferenceCapabilities(AgentTaskType.CLASSIFY)
      ).toEqual([]);
      expect(
        await agent.listInferenceCapabilities(AgentTaskType.INFER)
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

  describe("concurrent initialization", () => {
    it("should coalesce concurrent infer calls into a single init", async () => {
      let resolveInit: () => void;
      provider.initialize.mockReturnValue(
        new Promise<void>((r) => {
          resolveInit = r;
        })
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
