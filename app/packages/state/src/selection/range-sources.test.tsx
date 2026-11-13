import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  registerSelectionRangeSource,
  useSelectionRangeSource,
} from "./range-sources";

afterEach(cleanup);

it("stays inert without a source and updates captures when one is registered", () => {
  const filters = { events: { values: ["motion"] } };
  const { result } = renderHook(() =>
    useSelectionRangeSource({ mediaType: "multimodal", filters }),
  );
  expect(result.current).toBeUndefined();
  const source = { source: "test:ranges", parameters: { filters } };
  const resolver = vi.fn(() => source);
  let unregister: () => void;
  act(() => {
    unregister = registerSelectionRangeSource(resolver);
  });
  expect(result.current).toEqual(source);
  expect(resolver).toHaveBeenCalledWith({ mediaType: "multimodal", filters });
  act(() => unregister());
  expect(result.current).toBeUndefined();
});
