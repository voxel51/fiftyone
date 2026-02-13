import type { Sample } from "@fiftyone/looker";
import type { AnnotationLabel } from "@fiftyone/state";
import type { Field } from "@fiftyone/utilities";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpType } from "../types";
import { handleLabelPersistence } from "./labelPersistence";

vi.mock("../deltas", () => ({
  buildJsonPath: vi.fn(),
  buildLabelDeltas: vi.fn(),
}));

import { buildJsonPath, buildLabelDeltas } from "../deltas";

describe("handleLabelPersistence", () => {
  let mockPatchSample: ReturnType<typeof vi.fn>;
  let mockSample: Sample;
  let mockAnnotationLabel: AnnotationLabel;
  let mockSchema: Field;
  let mockOpType: OpType;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPatchSample = vi.fn().mockResolvedValue(true);
    mockSample = { id: "sample-id" } as Sample;
    mockAnnotationLabel = {
      path: "predictions.detections",
      id: "label-id",
    } as AnnotationLabel;
    mockSchema = { name: "detections" } as Field;
    mockOpType = "mutate";

    vi.mocked(buildLabelDeltas).mockReturnValue([]);
    vi.mocked(buildJsonPath).mockImplementation(
      (basePath, deltaPath) => `${basePath}.${deltaPath}`
    );
  });

  it("should return false when sample is null", async () => {
    const result = await handleLabelPersistence({
      sample: null,
      applyPatch: mockPatchSample,
      annotationLabel: mockAnnotationLabel,
      schema: mockSchema,
      opType: mockOpType,
    });

    expect(result).toBe(false);
    expect(mockPatchSample).not.toHaveBeenCalled();
  });

  it("should return false when annotationLabel is null", async () => {
    const result = await handleLabelPersistence({
      sample: mockSample,
      applyPatch: mockPatchSample,
      annotationLabel: null,
      schema: mockSchema,
      opType: mockOpType,
    });

    expect(result).toBe(false);
    expect(mockPatchSample).not.toHaveBeenCalled();
  });

  it("should call buildLabelDeltas with correct arguments", async () => {
    vi.mocked(buildLabelDeltas).mockReturnValue([
      { path: "label", value: "cat", op: "replace" },
    ]);

    await handleLabelPersistence({
      sample: mockSample,
      applyPatch: mockPatchSample,
      annotationLabel: mockAnnotationLabel,
      schema: mockSchema,
      opType: mockOpType,
    });

    expect(buildLabelDeltas).toHaveBeenCalledWith(
      mockSample,
      mockAnnotationLabel,
      mockSchema,
      mockOpType
    );
  });

  it("should transform label deltas to sample deltas", async () => {
    const mockDeltas = [
      { path: "label", value: "cat", op: "replace" },
      { path: "confidence", value: 0.95, op: "replace" },
    ];

    vi.mocked(buildLabelDeltas).mockReturnValue(mockDeltas);
    vi.mocked(buildJsonPath)
      .mockReturnValueOnce("predictions.detections.label")
      .mockReturnValueOnce("predictions.detections.confidence");

    await handleLabelPersistence({
      sample: mockSample,
      applyPatch: mockPatchSample,
      annotationLabel: mockAnnotationLabel,
      schema: mockSchema,
      opType: mockOpType,
    });

    expect(buildJsonPath).toHaveBeenCalledTimes(2);
    expect(buildJsonPath).toHaveBeenNthCalledWith(
      1,
      "predictions.detections",
      "label"
    );
    expect(buildJsonPath).toHaveBeenNthCalledWith(
      2,
      "predictions.detections",
      "confidence"
    );
  });

  it("should call patchSample with transformed deltas", async () => {
    const mockDeltas = [{ path: "label", value: "dog", op: "replace" }];

    vi.mocked(buildLabelDeltas).mockReturnValue(mockDeltas);
    vi.mocked(buildJsonPath).mockReturnValue("predictions.detections.label");

    await handleLabelPersistence({
      sample: mockSample,
      applyPatch: mockPatchSample,
      annotationLabel: mockAnnotationLabel,
      schema: mockSchema,
      opType: mockOpType,
    });

    expect(mockPatchSample).toHaveBeenCalledWith([
      {
        path: "predictions.detections.label",
        value: "dog",
        op: "replace",
      },
    ]);
  });

  it("should return true when patchSample succeeds", async () => {
    vi.mocked(buildLabelDeltas).mockReturnValue([
      { path: "label", value: "cat", op: "replace" },
    ]);
    mockPatchSample.mockResolvedValue(true);

    const result = await handleLabelPersistence({
      sample: mockSample,
      applyPatch: mockPatchSample,
      annotationLabel: mockAnnotationLabel,
      schema: mockSchema,
      opType: mockOpType,
    });

    expect(result).toBe(true);
  });

  it("should return false when patchSample fails", async () => {
    vi.mocked(buildLabelDeltas).mockReturnValue([
      { path: "label", value: "cat", op: "replace" },
    ]);
    mockPatchSample.mockResolvedValue(false);

    const result = await handleLabelPersistence({
      sample: mockSample,
      applyPatch: mockPatchSample,
      annotationLabel: mockAnnotationLabel,
      schema: mockSchema,
      opType: mockOpType,
    });

    expect(result).toBe(false);
  });

  it("should handle empty deltas array", async () => {
    vi.mocked(buildLabelDeltas).mockReturnValue([]);

    const result = await handleLabelPersistence({
      sample: mockSample,
      applyPatch: mockPatchSample,
      annotationLabel: mockAnnotationLabel,
      schema: mockSchema,
      opType: mockOpType,
    });

    expect(mockPatchSample).toHaveBeenCalledWith([]);
    expect(result).toBe(true);
  });

  it("should handle multiple deltas correctly", async () => {
    const mockDeltas = [
      { path: "label", value: "cat", op: "replace" },
      { path: "confidence", value: 0.95, op: "replace" },
      { path: "bounding_box", value: [0, 0, 100, 100], op: "replace" },
    ];

    vi.mocked(buildLabelDeltas).mockReturnValue(mockDeltas);
    vi.mocked(buildJsonPath)
      .mockReturnValueOnce("predictions.detections.label")
      .mockReturnValueOnce("predictions.detections.confidence")
      .mockReturnValueOnce("predictions.detections.bounding_box");

    await handleLabelPersistence({
      sample: mockSample,
      applyPatch: mockPatchSample,
      annotationLabel: mockAnnotationLabel,
      schema: mockSchema,
      opType: mockOpType,
    });

    expect(mockPatchSample).toHaveBeenCalledWith([
      { path: "predictions.detections.label", value: "cat", op: "replace" },
      { path: "predictions.detections.confidence", value: 0.95, op: "replace" },
      {
        path: "predictions.detections.bounding_box",
        value: [0, 0, 100, 100],
        op: "replace",
      },
    ]);
  });

  it("should propagate errors from patchSample", async () => {
    vi.mocked(buildLabelDeltas).mockReturnValue([
      { path: "label", value: "cat", op: "replace" },
    ]);
    const error = new Error("Network error");
    mockPatchSample.mockRejectedValue(error);

    await expect(
      handleLabelPersistence({
        sample: mockSample,
        applyPatch: mockPatchSample,
        annotationLabel: mockAnnotationLabel,
        schema: mockSchema,
        opType: mockOpType,
      })
    ).rejects.toThrow("Network error");
  });

  it("should preserve all delta properties when transforming", async () => {
    const mockDeltas = [
      {
        path: "label",
        value: "cat",
        op: "replace",
        customProp: "custom-value",
      },
    ];

    vi.mocked(buildLabelDeltas).mockReturnValue(mockDeltas);
    vi.mocked(buildJsonPath).mockReturnValue("predictions.detections.label");

    await handleLabelPersistence({
      sample: mockSample,
      applyPatch: mockPatchSample,
      annotationLabel: mockAnnotationLabel,
      schema: mockSchema,
      opType: mockOpType,
    });

    expect(mockPatchSample).toHaveBeenCalledWith([
      {
        path: "predictions.detections.label",
        value: "cat",
        op: "replace",
        customProp: "custom-value",
      },
    ]);
  });
});
