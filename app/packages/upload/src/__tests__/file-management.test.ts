import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useFileUpload } from "../useFileUpload";
import { createFile, setupFetchMock } from "./helpers";

setupFetchMock();

describe("removeFile", () => {
  it("removes a file by id", () => {
    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([
        createFile("a.png", 100, "image/png"),
        createFile("b.png", 200, "image/png"),
      ]);
    });

    const idToRemove = result.current.files[0].id;

    act(() => {
      result.current.removeFile(idToRemove);
    });

    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0].name).toBe("b.png");
  });

  it("is a no-op for an unknown id", () => {
    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    act(() => {
      result.current.removeFile("nonexistent");
    });

    expect(result.current.files).toHaveLength(1);
  });
});

describe("clear", () => {
  it("removes all selected files", () => {
    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([
        createFile("a.png", 100, "image/png"),
        createFile("b.png", 200, "image/png"),
      ]);
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.files).toEqual([]);
    expect(result.current.totalFiles).toBe(0);
  });
});
