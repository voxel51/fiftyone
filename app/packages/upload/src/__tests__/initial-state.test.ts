import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useFileUpload } from "../useFileUpload";
import { setupFetchMock } from "./helpers";

setupFetchMock();

describe("initial state", () => {
  it("starts with an empty file list", () => {
    const { result } = renderHook(() => useFileUpload());
    expect(result.current.files).toEqual([]);
  });

  it("is not uploading", () => {
    const { result } = renderHook(() => useFileUpload());
    expect(result.current.isUploading).toBe(false);
  });

  it("has zero counts", () => {
    const { result } = renderHook(() => useFileUpload());
    expect(result.current.totalFiles).toBe(0);
    expect(result.current.completedFiles).toBe(0);
    expect(result.current.failedFiles).toBe(0);
  });

  it("has no errors", () => {
    const { result } = renderHook(() => useFileUpload());
    expect(result.current.errors).toEqual([]);
  });
});
