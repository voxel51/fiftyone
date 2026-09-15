import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveOperatorURI } from "./operators";

// Recoil is fully mocked below, so the real module is never used — but
// importing it to get a typed handle for `vi.mocked` still trips the
// Recoil-freeze lint rule, which CI fails on. Hoisting the mock gives the same
// handle without the import.
const recoil = vi.hoisted(() => ({
  useRecoilState: vi.fn(),
  useRecoilValue: vi.fn(),
  useSetRecoilState: vi.fn(),
}));

vi.mock("@fiftyone/state", () => ({}));

vi.mock("@fiftyone/plugins", () => ({
  pluginsLoaderAtom: "pluginsLoaderAtom",
}));

vi.mock("recoil", () => recoil);

vi.mock("./operators", () => ({
  ExecutionContext: vi.fn(),
  fetchRemotePlacements: vi.fn(),
  listLocalAndRemoteOperators: vi.fn(),
  resolveLocalPlacements: vi.fn(),
  resolveOperatorURI: vi.fn(),
}));

vi.mock("./state", () => ({
  activePanelsEventCountAtom: "activePanelsEventCountAtom",
  availableOperators: "availableOperators",
  operatorPlacementsAtom: "operatorPlacementsAtom",
  operatorThrottledContext: "operatorThrottledContext",
  operatorsInitializedAtom: "operatorsInitializedAtom",
  useCurrentSample: vi.fn(),
}));

import { useFirstExistingUri, useOperatorAvailability } from "./hooks";

describe("operator availability hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveOperatorURI).mockImplementation((uri) =>
      uri.startsWith("@") ? uri : `@voxel51/operators/${uri}`,
    );
  });

  it("resolves bare URIs and reacts when definitions register", () => {
    recoil.useRecoilValue.mockReturnValue([]);
    const uris = ["missing", "list_workspaces"];
    const { result, rerender } = renderHook(() => ({
      available: useOperatorAvailability("list_workspaces"),
      first: useFirstExistingUri(uris),
    }));

    expect(result.current.available).toBe(false);
    expect(result.current.first).toEqual({
      firstExistingUri: undefined,
      exists: false,
    });

    recoil.useRecoilValue.mockReturnValue([
      { value: "@voxel51/operators/list_workspaces" },
    ]);
    rerender();

    expect(result.current.available).toBe(true);
    expect(result.current.first).toEqual({
      firstExistingUri: "list_workspaces",
      exists: true,
    });
  });
});
