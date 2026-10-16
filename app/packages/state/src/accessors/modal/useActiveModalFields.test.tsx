import { act, cleanup, renderHook } from "@testing-library/react";
// Exercise the existing Recoil stores; production callers use the hook.
// eslint-disable-next-line no-restricted-imports
import { RecoilRoot } from "recoil";
import { afterEach, describe, expect, it } from "vitest";
import { useActiveModalFields } from ".";

afterEach(cleanup);

describe("useActiveModalFields", () => {
  it("provides the stored choice, null for the default", () => {
    const { result } = renderHook(() => useActiveModalFields(), {
      wrapper: RecoilRoot,
    });

    // the default follows the current schema, so it is not a resolved list
    expect(result.current[0]).toBeNull();

    act(() => result.current[1](["gt"]));
    expect(result.current[0]).toStrictEqual(["gt"]);

    // restoring the default
    act(() => result.current[1](null));
    expect(result.current[0]).toBeNull();
  });
});
