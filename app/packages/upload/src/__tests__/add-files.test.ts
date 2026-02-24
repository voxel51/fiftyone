import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useFileUpload } from "../useFileUpload";
import { createFile, setupFetchMock } from "./helpers";

setupFetchMock();

describe("addFiles — basic", () => {
  it("adds files to the list with selected status", () => {
    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([
        createFile("a.png", 100, "image/png"),
        createFile("b.jpg", 200, "image/jpeg"),
      ]);
    });

    expect(result.current.files).toHaveLength(2);
    expect(result.current.files[0].status).toBe("selected");
    expect(result.current.files[1].status).toBe("selected");
  });

  it("populates name, size, type, and progress from the file", () => {
    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("photo.png", 1024, "image/png")]);
    });

    const item = result.current.files[0];
    expect(item.name).toBe("photo.png");
    expect(item.size).toBe(1024);
    expect(item.type).toBe("image/png");
    expect(item.progress).toBe(0);
  });

  it("assigns a unique id to each file", () => {
    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([
        createFile("a.png", 100, "image/png"),
        createFile("b.png", 200, "image/png"),
      ]);
    });

    const ids = result.current.files.map((f) => f.id);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("updates totalFiles count", () => {
    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([
        createFile("a.png", 100, "image/png"),
        createFile("b.png", 200, "image/png"),
      ]);
    });

    expect(result.current.totalFiles).toBe(2);
  });
});

describe("addFiles — single mode", () => {
  it("replaces the existing file when multiple is false", () => {
    const { result } = renderHook(() => useFileUpload({ multiple: false }));

    act(() => {
      result.current.addFiles([createFile("first.png", 100, "image/png")]);
    });
    expect(result.current.files[0].name).toBe("first.png");

    act(() => {
      result.current.addFiles([createFile("second.png", 200, "image/png")]);
    });
    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0].name).toBe("second.png");
  });

  it("takes only the first file when given multiple files", () => {
    const { result } = renderHook(() => useFileUpload({ multiple: false }));

    act(() => {
      result.current.addFiles([
        createFile("a.png", 100, "image/png"),
        createFile("b.png", 200, "image/png"),
      ]);
    });

    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0].name).toBe("a.png");
  });

  it("defaults to single mode when multiple is not specified", () => {
    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("first.png", 100, "image/png")]);
    });
    act(() => {
      result.current.addFiles([createFile("second.png", 200, "image/png")]);
    });

    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0].name).toBe("second.png");
  });
});

describe("addFiles — multi mode", () => {
  it("appends to the existing list", () => {
    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });
    act(() => {
      result.current.addFiles([createFile("b.png", 200, "image/png")]);
    });

    expect(result.current.files).toHaveLength(2);
    expect(result.current.files[0].name).toBe("a.png");
    expect(result.current.files[1].name).toBe("b.png");
  });
});
