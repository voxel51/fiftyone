import { vi, describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../util", () => ({
  handleLabelPersistence: vi.fn(),
}));

vi.mock("@fiftyone/state", () => ({
  generatedDatasetName: { key: "generatedDatasetName" },
  isGeneratedView: { key: "isGeneratedView" },
  useCurrentDatasetId: vi.fn(),
  useModalSample: vi.fn(),
  useUpdateSamples: vi.fn(),
}));

vi.mock("recoil", () => ({
  useRecoilValue: vi.fn(),
}));

import { handleLabelPersistence } from "../util";
import {
  isGeneratedView,
  useCurrentDatasetId,
  useModalSample,
  useUpdateSamples,
} from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { useUpsertLabel, useDeleteLabel } from "./useLabelPersistence";
import type { Field } from "@fiftyone/utilities";
import type { LabelProxy } from "../deltas";

const SAMPLE = { id: "sample-1" };
const LABEL: LabelProxy = {
  type: "Detection",
  path: "predictions",
  data: { _id: "label-1", label: "cat" },
  boundingBox: [0.1, 0.2, 0.3, 0.4],
};
const SCHEMA: Field = { name: "detections" } as Field;

describe("useUpsertLabel / useDeleteLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useRecoilValue).mockReturnValue(false);
    vi.mocked(useModalSample).mockReturnValue({ sample: SAMPLE } as any);
    vi.mocked(useCurrentDatasetId).mockReturnValue("dataset-1");
    vi.mocked(useUpdateSamples).mockReturnValue(vi.fn());
    vi.mocked(handleLabelPersistence).mockResolvedValue(true);
  });

  describe("useUpsertLabel", () => {
    it("calls handleLabelPersistence with opType mutate", async () => {
      const { result } = renderHook(() => useUpsertLabel());

      await result.current(LABEL, SCHEMA);

      expect(handleLabelPersistence).toHaveBeenCalledWith(
        expect.objectContaining({
          annotationLabel: LABEL,
          schema: SCHEMA,
          opType: "mutate",
        })
      );
    });

    it("passes the current sample to handleLabelPersistence", async () => {
      const { result } = renderHook(() => useUpsertLabel());

      await result.current(LABEL, SCHEMA);

      expect(handleLabelPersistence).toHaveBeenCalledWith(
        expect.objectContaining({ sample: SAMPLE })
      );
    });

    it("passes isGenerated from recoil state", async () => {
      vi.mocked(useRecoilValue).mockReturnValue(true);
      const { result } = renderHook(() => useUpsertLabel());

      await result.current(LABEL, SCHEMA);

      expect(handleLabelPersistence).toHaveBeenCalledWith(
        expect.objectContaining({ isGenerated: true })
      );
    });

    it("returns true when handleLabelPersistence succeeds", async () => {
      vi.mocked(handleLabelPersistence).mockResolvedValue(true);
      const { result } = renderHook(() => useUpsertLabel());

      expect(await result.current(LABEL, SCHEMA)).toBe(true);
    });

    it("returns false when handleLabelPersistence fails", async () => {
      vi.mocked(handleLabelPersistence).mockResolvedValue(false);
      const { result } = renderHook(() => useUpsertLabel());

      expect(await result.current(LABEL, SCHEMA)).toBe(false);
    });
  });

  describe("useDeleteLabel", () => {
    it("calls handleLabelPersistence with opType delete", async () => {
      const { result } = renderHook(() => useDeleteLabel());

      await result.current(LABEL, SCHEMA);

      expect(handleLabelPersistence).toHaveBeenCalledWith(
        expect.objectContaining({
          annotationLabel: LABEL,
          schema: SCHEMA,
          opType: "delete",
        })
      );
    });

    it("passes the current sample to handleLabelPersistence", async () => {
      const { result } = renderHook(() => useDeleteLabel());

      await result.current(LABEL, SCHEMA);

      expect(handleLabelPersistence).toHaveBeenCalledWith(
        expect.objectContaining({ sample: SAMPLE })
      );
    });

    it("passes isGenerated from recoil state", async () => {
      vi.mocked(useRecoilValue).mockReturnValue(true);
      const { result } = renderHook(() => useDeleteLabel());

      await result.current(LABEL, SCHEMA);

      expect(handleLabelPersistence).toHaveBeenCalledWith(
        expect.objectContaining({ isGenerated: true })
      );
    });

    it("returns true when handleLabelPersistence succeeds", async () => {
      vi.mocked(handleLabelPersistence).mockResolvedValue(true);
      const { result } = renderHook(() => useDeleteLabel());

      expect(await result.current(LABEL, SCHEMA)).toBe(true);
    });

    it("returns false when handleLabelPersistence fails", async () => {
      vi.mocked(handleLabelPersistence).mockResolvedValue(false);
      const { result } = renderHook(() => useDeleteLabel());

      expect(await result.current(LABEL, SCHEMA)).toBe(false);
    });
  });

  it("useRecoilValue is called with the isGeneratedView atom", () => {
    renderHook(() => useUpsertLabel());

    expect(useRecoilValue).toHaveBeenCalledWith(isGeneratedView);
  });
});
