import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useFileUpload } from "../useFileUpload";
import { setupFetchMock } from "./helpers";

setupFetchMock();

describe("inputProps", () => {
  it("reflects the accept option as a comma-joined string", () => {
    const { result } = renderHook(() =>
      useFileUpload({ accept: [".png", ".jpg"] })
    );

    expect(result.current.inputProps.accept).toBe(".png,.jpg");
  });

  it("reflects the multiple option", () => {
    const { result: single } = renderHook(() =>
      useFileUpload({ multiple: false })
    );
    expect(single.current.inputProps.multiple).toBe(false);

    const { result: multi } = renderHook(() =>
      useFileUpload({ multiple: true })
    );
    expect(multi.current.inputProps.multiple).toBe(true);
  });

  it("has a ref", () => {
    const { result } = renderHook(() => useFileUpload());
    expect(result.current.inputProps.ref).toBeDefined();
  });
});
