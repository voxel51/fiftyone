import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  getGridPosterProvider,
  registerGridPosterProvider,
  resetGridPosterProviderForTests,
  useGridPosterProvider,
} from "./registry";
import type { GridPosterProvider } from "./types";

afterEach(() => resetGridPosterProviderForTests());

describe("grid poster provider registry", () => {
  it("publishes registration changes to mounted consumers", () => {
    const provider = createProvider("teams:projection");
    const { result } = renderHook(() => useGridPosterProvider());

    let unregister: () => void = () => undefined;
    act(() => {
      unregister = registerGridPosterProvider(provider);
    });
    expect(result.current).toBe(provider);

    act(() => unregister());
    expect(result.current).toBeNull();
  });

  it("rejects ambiguous and unnamespaced registrations", () => {
    expect(() =>
      registerGridPosterProvider(createProvider("projection")),
    ).toThrow("must be namespaced");
    registerGridPosterProvider(createProvider("teams:projection"));

    expect(() =>
      registerGridPosterProvider(createProvider("other:projection")),
    ).toThrow("already registered");
    expect(getGridPosterProvider()?.id).toBe("teams:projection");
  });
});

function createProvider(id: string): GridPosterProvider {
  return {
    id,
    resolveDescriptor: async () => null,
  };
}
