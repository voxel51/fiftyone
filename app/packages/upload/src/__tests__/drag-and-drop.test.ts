import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useFileUpload } from "../useFileUpload";
import { createDragEvent, createFile, setupFetchMock } from "./helpers";

setupFetchMock();

describe("dropProps", () => {
  it("isDragActive starts as false", () => {
    const { result } = renderHook(() => useFileUpload());
    expect(result.current.dropProps.isDragActive).toBe(false);
  });

  it("onDragOver sets isDragActive to true", () => {
    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.dropProps.onDragOver(createDragEvent([]));
    });

    expect(result.current.dropProps.isDragActive).toBe(true);
  });

  it("onDragLeave sets isDragActive to false", () => {
    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.dropProps.onDragOver(createDragEvent([]));
    });
    expect(result.current.dropProps.isDragActive).toBe(true);

    act(() => {
      result.current.dropProps.onDragLeave(createDragEvent([]));
    });
    expect(result.current.dropProps.isDragActive).toBe(false);
  });

  it("onDrop adds files and resets isDragActive", () => {
    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.dropProps.onDragOver(createDragEvent([]));
    });

    act(() => {
      result.current.dropProps.onDrop(
        createDragEvent([createFile("dropped.png", 100, "image/png")])
      );
    });

    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0].name).toBe("dropped.png");
    expect(result.current.dropProps.isDragActive).toBe(false);
  });

  it("onDrop respects accept filter", () => {
    const { result } = renderHook(() => useFileUpload({ accept: [".png"] }));

    act(() => {
      result.current.dropProps.onDrop(
        createDragEvent([createFile("bad.gif", 100, "image/gif")])
      );
    });

    expect(result.current.files).toHaveLength(0);
    expect(result.current.errors.length).toBeGreaterThan(0);
  });
});
