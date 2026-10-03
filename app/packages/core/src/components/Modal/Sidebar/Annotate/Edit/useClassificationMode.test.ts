// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refs = vi.hoisted(() => ({
  annotationContext: { selected: null, createNew: vi.fn() } as unknown,
  fields: [] as string[],
  isVideo: false,
}));

vi.mock("recoil", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recoil")>();
  return {
    ...actual,
    useRecoilValue: (a: unknown) =>
      a === "__isVideoDataset__" ? refs.isVideo : false,
  };
});

vi.mock("@fiftyone/state", () => ({
  isPatchesView: "__isPatchesView__",
  isVideoDataset: "__isVideoDataset__",
}));

vi.mock("@fiftyone/looker-3d/src/state/accessors", () => ({
  useReset3dAnnotationMode: () => () => {},
}));

vi.mock("./useAnnotationContext", () => ({
  useAnnotationContext: () => refs.annotationContext,
  useAnnotationFields: () => ({ fields: refs.fields }),
}));

vi.mock("./useExit", () => ({
  default: () => () => {},
}));

vi.mock("../state", async () => {
  const { atom } = await import("jotai");
  return {
    labelSchemasData: atom({
      cls: { type: "classification" },
      "frames.framecls": { type: "classification" },
      "frames.frametags": { type: "classifications" },
    }),
  };
});

const { useClassificationMode } = await import("./useClassificationMode");

beforeEach(() => {
  refs.annotationContext = { selected: null, createNew: vi.fn() };
  refs.fields = [];
  refs.isVideo = false;
});

describe("useClassificationMode video field filter", () => {
  it("keeps frame-level Classification fields on video datasets", () => {
    refs.isVideo = true;
    refs.fields = ["frames.framecls"];

    const { result } = renderHook(() => useClassificationMode());

    expect(result.current.disabled).toBe(false);
    expect(result.current.tooltip).toBe("Create new classification");
  });

  it("drops frame-level Classifications lists on video datasets", () => {
    refs.isVideo = true;
    refs.fields = ["frames.frametags"];

    const { result } = renderHook(() => useClassificationMode());

    expect(result.current.disabled).toBe(true);
    expect(result.current.tooltip).toBe("No active fields");
  });

  it("leaves field list unchanged on image datasets", () => {
    refs.isVideo = false;
    refs.fields = ["cls"];

    const { result } = renderHook(() => useClassificationMode());

    expect(result.current.disabled).toBe(false);
    expect(result.current.tooltip).toBe("Create new classification");
  });
});
