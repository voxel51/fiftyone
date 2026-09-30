import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ useViewTargets: vi.fn() }));

vi.mock("@fiftyone/operators", () => ({
  useViewTargets: env.useViewTargets,
}));
vi.mock("./useSearchSelection", () => ({
  useSearchSelection: () => ({
    selectedLabels: [],
    view: [],
    hasSamplesSelected: false,
    queryIds: [],
    negativeQueryIds: [],
    hasView: false,
  }),
}));
vi.mock("./useSearchSubmission", () => ({
  useSearchSubmission: () => ({}),
}));

import type { AnnotatedBrainKeyConfig } from "../types";
import { ViewTarget } from "../types";
import { useNewSearchForm } from "./useNewSearchForm";

const index = (patches_field?: string) =>
  ({
    key: "sim",
    compatible: true,
    supports_prompts: true,
    patches_field,
  }) as AnnotatedBrainKeyConfig;

describe("useNewSearchForm", () => {
  beforeEach(() => {
    env.useViewTargets.mockReset();
    env.useViewTargets.mockReturnValue({
      targets: [],
      defaultTarget: ViewTarget.CURRENT_VIEW,
    });
  });

  it("requires a flat target only for a patches index, as the search operator does", () => {
    renderHook(() => useNewSearchForm([index()], null, vi.fn()));
    expect(env.useViewTargets).toHaveBeenLastCalledWith({
      requireFlat: false,
    });

    renderHook(() => useNewSearchForm([index("detections")], null, vi.fn()));
    expect(env.useViewTargets).toHaveBeenLastCalledWith({
      requireFlat: true,
    });
  });
});
