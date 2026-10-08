import { renderHook } from "@testing-library/react";
import { useReverbValue } from "@fiftyone/reverb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveOperatorURI } from "./operators";

vi.mock("@fiftyone/state", () => ({}));

vi.mock("@fiftyone/plugins", () => ({
  pluginsLoaderAtom: "pluginsLoaderAtom",
}));

vi.mock("@fiftyone/reverb", () => ({
  useReverbState: vi.fn(),
  useReverbValue: vi.fn(),
  useSetReverbState: vi.fn(),
}));

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
    vi.mocked(useReverbValue).mockReturnValue([]);
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

    vi.mocked(useReverbValue).mockReturnValue([
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
