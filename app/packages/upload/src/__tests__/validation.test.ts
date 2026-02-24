import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useFileUpload } from "../useFileUpload";
import { createFile, setupFetchMock } from "./helpers";

setupFetchMock();

describe("addFiles — accept filter", () => {
  it("rejects files that do not match accepted extensions", () => {
    const { result } = renderHook(() =>
      useFileUpload({ multiple: true, accept: [".png", ".jpg"] })
    );

    act(() => {
      result.current.addFiles([
        createFile("good.png", 100, "image/png"),
        createFile("bad.gif", 100, "image/gif"),
      ]);
    });

    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0].name).toBe("good.png");
    expect(result.current.errors.length).toBeGreaterThan(0);
  });

  it("accepts files when no accept filter is set", () => {
    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([
        createFile("any.xyz", 100, "application/octet-stream"),
      ]);
    });

    expect(result.current.files).toHaveLength(1);
    expect(result.current.errors).toEqual([]);
  });
});

describe("addFiles — maxSize", () => {
  it("rejects files exceeding maxSize", () => {
    const { result } = renderHook(() =>
      useFileUpload({ multiple: true, maxSize: 500 })
    );

    act(() => {
      result.current.addFiles([
        createFile("small.png", 100, "image/png"),
        createFile("big.png", 1000, "image/png"),
      ]);
    });

    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0].name).toBe("small.png");
    expect(result.current.errors.length).toBeGreaterThan(0);
  });

  it("uses custom maxSizeMessage in the error", () => {
    const { result } = renderHook(() =>
      useFileUpload({ maxSize: 500, maxSizeMessage: "Too big!" })
    );

    act(() => {
      result.current.addFiles([createFile("big.png", 1000, "image/png")]);
    });

    expect(result.current.errors).toContain("Too big!");
  });
});

describe("addFiles — custom validate", () => {
  it("rejects files that fail custom validation", () => {
    const validate = (file: File) =>
      file.name.startsWith("bad") ? "Invalid file name" : null;

    const { result } = renderHook(() =>
      useFileUpload({ multiple: true, validate })
    );

    act(() => {
      result.current.addFiles([
        createFile("good.png", 100, "image/png"),
        createFile("bad.png", 100, "image/png"),
      ]);
    });

    expect(result.current.files).toHaveLength(1);
    expect(result.current.errors).toContain("Invalid file name");
  });
});

describe("addFiles — deduplication", () => {
  it("ignores duplicate files based on name, size, and lastModified", () => {
    const ts = Date.now();
    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png", ts)]);
    });
    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png", ts)]);
    });

    expect(result.current.files).toHaveLength(1);
  });

  it("allows files with the same name but different size", () => {
    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });
    act(() => {
      result.current.addFiles([createFile("a.png", 999, "image/png")]);
    });

    expect(result.current.files).toHaveLength(2);
  });
});

describe("addFiles — error lifecycle", () => {
  it("clears previous validation errors on a new addFiles call", () => {
    const { result } = renderHook(() => useFileUpload({ accept: [".png"] }));

    act(() => {
      result.current.addFiles([createFile("bad.gif", 100, "image/gif")]);
    });
    expect(result.current.errors.length).toBeGreaterThan(0);

    act(() => {
      result.current.addFiles([createFile("good.png", 100, "image/png")]);
    });
    expect(result.current.errors).toEqual([]);
  });
});
