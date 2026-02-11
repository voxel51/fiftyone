import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFileUpload } from "./useFileUpload";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFile(
  name: string,
  size: number,
  type: string,
  lastModified?: number
): File {
  const content = new Uint8Array(size);
  return new File([content], name, {
    type,
    lastModified: lastModified ?? Date.now(),
  });
}

function createDragEvent(files: File[]): React.DragEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: { files },
  } as unknown as React.DragEvent;
}

/** A promise whose resolution is controlled externally. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function successResponse(path: string) {
  return new Response(JSON.stringify({ path }), { status: 201 });
}

function errorResponse(status: number, code: string, message = "error") {
  return new Response(JSON.stringify({ error: { code, message } }), { status });
}

const mockFetch = vi.fn();

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

// ===========================================================================
// Tests
// ===========================================================================

describe("useFileUpload", () => {
  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // addFiles — basic behavior
  // -------------------------------------------------------------------------

  describe("addFiles", () => {
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

  // -------------------------------------------------------------------------
  // addFiles — single vs multi mode
  // -------------------------------------------------------------------------

  describe("addFiles — single mode", () => {
    it("replaces the existing file when multiple is false", () => {
      const { result } = renderHook(() => useFileUpload({ multiple: false }));

      act(() => {
        result.current.addFiles([createFile("first.png", 100, "image/png")]);
      });
      expect(result.current.files).toHaveLength(1);
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

  // -------------------------------------------------------------------------
  // addFiles — validation
  // -------------------------------------------------------------------------

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
        useFileUpload({
          maxSize: 500,
          maxSizeMessage: "Too big!",
        })
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
      expect(result.current.files[0].name).toBe("good.png");
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

  // -------------------------------------------------------------------------
  // removeFile
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // clear
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // dropProps
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // inputProps
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // upload — success
  // -------------------------------------------------------------------------

  describe("upload", () => {
    it("transitions files from selected to success", async () => {
      mockFetch.mockResolvedValueOnce(successResponse("/uploads/photo.png"));

      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile("photo.png", 100, "image/png")]);
      });

      await act(async () => {
        await result.current.upload({ destination: "/uploads" });
      });

      expect(result.current.files[0].status).toBe("success");
      expect(result.current.files[0].progress).toBe(100);
    });

    it("sets remotePath from the server response", async () => {
      mockFetch.mockResolvedValueOnce(
        successResponse("s3://bucket/images/photo.png")
      );

      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile("photo.png", 100, "image/png")]);
      });

      await act(async () => {
        await result.current.upload({
          destination: "s3://bucket/images",
        });
      });

      expect(result.current.files[0].remotePath).toBe(
        "s3://bucket/images/photo.png"
      );
    });

    it("sends a POST with the resolved path as a query parameter", async () => {
      mockFetch.mockResolvedValueOnce(
        successResponse("/data/uploads/file.png")
      );

      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile("file.png", 100, "image/png")]);
      });

      await act(async () => {
        await result.current.upload({ destination: "/data/uploads" });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/files/upload"),
        expect.objectContaining({ method: "POST" })
      );

      const calledUrl = mockFetch.mock.calls[0][0];
      const url = new URL(calledUrl, "http://localhost");
      expect(url.searchParams.get("path")).toBe("/data/uploads/file.png");
    });

    it("uses default path resolution: destination/filename", async () => {
      mockFetch.mockResolvedValueOnce(successResponse("/my/dir/report.pdf"));

      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([
          createFile("report.pdf", 500, "application/pdf"),
        ]);
      });

      await act(async () => {
        await result.current.upload({ destination: "/my/dir" });
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      const url = new URL(calledUrl, "http://localhost");
      expect(url.searchParams.get("path")).toBe("/my/dir/report.pdf");
    });

    it("uses a custom resolvePath when provided", async () => {
      mockFetch.mockResolvedValueOnce(
        successResponse("gs://bucket/custom_photo.png")
      );

      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile("photo.png", 100, "image/png")]);
      });

      await act(async () => {
        await result.current.upload({
          destination: "gs://bucket",
          resolvePath: (dest, file) => `${dest}/custom_${file.name}`,
        });
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      const url = new URL(calledUrl, "http://localhost");
      expect(url.searchParams.get("path")).toBe("gs://bucket/custom_photo.png");
    });

    it("uses a custom endpoint when provided", async () => {
      mockFetch.mockResolvedValueOnce(successResponse("/uploads/a.png"));

      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile("a.png", 100, "image/png")]);
      });

      await act(async () => {
        await result.current.upload({
          destination: "/uploads",
          endpoint: "/api/v2/upload",
        });
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain("/api/v2/upload");
    });

    it("uploads multiple files", async () => {
      mockFetch
        .mockResolvedValueOnce(successResponse("/uploads/a.png"))
        .mockResolvedValueOnce(successResponse("/uploads/b.png"));

      const { result } = renderHook(() => useFileUpload({ multiple: true }));

      act(() => {
        result.current.addFiles([
          createFile("a.png", 100, "image/png"),
          createFile("b.png", 200, "image/png"),
        ]);
      });

      await act(async () => {
        await result.current.upload({ destination: "/uploads" });
      });

      expect(result.current.files[0].status).toBe("success");
      expect(result.current.files[1].status).toBe("success");
      expect(result.current.completedFiles).toBe(2);
    });

    it("only uploads files with selected status", async () => {
      mockFetch.mockResolvedValue(successResponse("/uploads/new.png"));

      const { result } = renderHook(() => useFileUpload({ multiple: true }));

      // Upload first file
      act(() => {
        result.current.addFiles([createFile("first.png", 100, "image/png")]);
      });
      await act(async () => {
        await result.current.upload({ destination: "/uploads" });
      });

      // Add a second file and upload again
      act(() => {
        result.current.addFiles([createFile("new.png", 100, "image/png")]);
      });

      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce(successResponse("/uploads/new.png"));

      await act(async () => {
        await result.current.upload({ destination: "/uploads" });
      });

      // Only one POST should have been made (for the new file)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // upload — failure
  // -------------------------------------------------------------------------

  describe("upload — failure", () => {
    it("sets status to error on a non-201 response", async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse(403, "FEATURE_DISABLED", "File operations disabled")
      );

      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile("a.png", 100, "image/png")]);
      });

      await act(async () => {
        await result.current.upload({ destination: "/uploads" });
      });

      expect(result.current.files[0].status).toBe("error");
      expect(result.current.files[0].error).toBeTruthy();
    });

    it("sets status to error on a network failure", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile("a.png", 100, "image/png")]);
      });

      await act(async () => {
        await result.current.upload({ destination: "/uploads" });
      });

      expect(result.current.files[0].status).toBe("error");
      expect(result.current.files[0].error).toBeTruthy();
    });

    it("does not reject the upload promise when individual files fail", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile("a.png", 100, "image/png")]);
      });

      // Should not throw
      await act(async () => {
        await result.current.upload({ destination: "/uploads" });
      });

      expect(result.current.failedFiles).toBe(1);
    });

    it("handles mixed success and failure", async () => {
      mockFetch
        .mockResolvedValueOnce(successResponse("/uploads/ok.png"))
        .mockRejectedValueOnce(new TypeError("Network error"));

      const { result } = renderHook(() => useFileUpload({ multiple: true }));

      act(() => {
        result.current.addFiles([
          createFile("ok.png", 100, "image/png"),
          createFile("fail.png", 100, "image/png"),
        ]);
      });

      await act(async () => {
        await result.current.upload({ destination: "/uploads" });
      });

      expect(result.current.completedFiles).toBe(1);
      expect(result.current.failedFiles).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // upload — aggregate state during upload
  // -------------------------------------------------------------------------

  describe("upload — aggregate state", () => {
    it("isUploading is true while uploads are in flight", async () => {
      const d = deferred<Response>();
      mockFetch.mockReturnValueOnce(d.promise);

      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile("a.png", 100, "image/png")]);
      });

      let uploadPromise: Promise<void>;
      act(() => {
        uploadPromise = result.current.upload({ destination: "/uploads" });
      });

      expect(result.current.isUploading).toBe(true);

      d.resolve(successResponse("/uploads/a.png"));
      await act(async () => {
        await uploadPromise;
      });

      expect(result.current.isUploading).toBe(false);
    });

    it("isUploading is false after all uploads settle", async () => {
      mockFetch
        .mockResolvedValueOnce(successResponse("/uploads/a.png"))
        .mockRejectedValueOnce(new TypeError("fail"));

      const { result } = renderHook(() => useFileUpload({ multiple: true }));

      act(() => {
        result.current.addFiles([
          createFile("a.png", 100, "image/png"),
          createFile("b.png", 100, "image/png"),
        ]);
      });

      await act(async () => {
        await result.current.upload({ destination: "/uploads" });
      });

      expect(result.current.isUploading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // cancel (single file)
  // -------------------------------------------------------------------------

  describe("cancel", () => {
    it("removes a selected file from the list", async () => {
      const { result } = renderHook(() => useFileUpload({ multiple: true }));

      act(() => {
        result.current.addFiles([
          createFile("a.png", 100, "image/png"),
          createFile("b.png", 200, "image/png"),
        ]);
      });

      const id = result.current.files[0].id;

      await act(async () => {
        await result.current.cancel(id);
      });

      expect(result.current.files).toHaveLength(1);
      expect(result.current.files[0].name).toBe("b.png");
    });

    it("aborts and removes an uploading file", async () => {
      const d = deferred<Response>();
      mockFetch.mockReturnValueOnce(d.promise);

      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile("a.png", 100, "image/png")]);
      });

      let uploadPromise: Promise<void>;
      act(() => {
        uploadPromise = result.current.upload({ destination: "/uploads" });
      });

      expect(result.current.files[0].status).toBe("uploading");

      const id = result.current.files[0].id;
      await act(async () => {
        await result.current.cancel(id);
      });

      expect(result.current.files).toHaveLength(0);

      // Clean up the deferred so the test doesn't hang
      d.resolve(successResponse("/uploads/a.png"));
      await act(async () => {
        await uploadPromise;
      });
    });

    it("sends DELETE and removes a successfully uploaded file", async () => {
      mockFetch.mockResolvedValueOnce(successResponse("/uploads/a.png"));

      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile("a.png", 100, "image/png")]);
      });

      await act(async () => {
        await result.current.upload({ destination: "/uploads" });
      });

      expect(result.current.files[0].status).toBe("success");

      // Mock the DELETE
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      const id = result.current.files[0].id;
      await act(async () => {
        await result.current.cancel(id);
      });

      expect(result.current.files).toHaveLength(0);

      // Verify a DELETE was sent
      const deleteCall = mockFetch.mock.calls[1];
      expect(deleteCall[1]).toEqual(
        expect.objectContaining({ method: "DELETE" })
      );
      const deleteUrl = new URL(deleteCall[0], "http://localhost");
      expect(deleteUrl.searchParams.get("path")).toBe("/uploads/a.png");
    });

    it("removes an errored file without any network call", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("fail"));

      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile("a.png", 100, "image/png")]);
      });

      await act(async () => {
        await result.current.upload({ destination: "/uploads" });
      });

      expect(result.current.files[0].status).toBe("error");

      mockFetch.mockClear();

      const id = result.current.files[0].id;
      await act(async () => {
        await result.current.cancel(id);
      });

      expect(result.current.files).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // retry
  // -------------------------------------------------------------------------

  describe("retry", () => {
    it("re-uploads a failed file and transitions to success", async () => {
      // First attempt fails
      mockFetch.mockRejectedValueOnce(new TypeError("fail"));

      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile("a.png", 100, "image/png")]);
      });

      await act(async () => {
        await result.current.upload({ destination: "/uploads" });
      });

      expect(result.current.files[0].status).toBe("error");

      // Retry succeeds
      mockFetch.mockResolvedValueOnce(successResponse("/uploads/a.png"));

      await act(async () => {
        await result.current.retry(result.current.files[0].id);
      });

      expect(result.current.files[0].status).toBe("success");
      expect(result.current.files[0].remotePath).toBe("/uploads/a.png");
      expect(result.current.files[0].error).toBeUndefined();
    });

    it("re-uploads to the same destination path", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("fail"));

      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile("a.png", 100, "image/png")]);
      });

      await act(async () => {
        await result.current.upload({ destination: "/my/uploads" });
      });

      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce(successResponse("/my/uploads/a.png"));

      await act(async () => {
        await result.current.retry(result.current.files[0].id);
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      const url = new URL(calledUrl, "http://localhost");
      expect(url.searchParams.get("path")).toBe("/my/uploads/a.png");
    });

    it("can fail again and be retried again", async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError("fail 1"))
        .mockRejectedValueOnce(new TypeError("fail 2"))
        .mockResolvedValueOnce(successResponse("/uploads/a.png"));

      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile("a.png", 100, "image/png")]);
      });

      // First upload fails
      await act(async () => {
        await result.current.upload({ destination: "/uploads" });
      });
      expect(result.current.files[0].status).toBe("error");

      // First retry fails
      await act(async () => {
        await result.current.retry(result.current.files[0].id);
      });
      expect(result.current.files[0].status).toBe("error");

      // Second retry succeeds
      await act(async () => {
        await result.current.retry(result.current.files[0].id);
      });
      expect(result.current.files[0].status).toBe("success");
    });
  });

  // -------------------------------------------------------------------------
  // cancelAll
  // -------------------------------------------------------------------------

  describe("cancelAll", () => {
    it("clears all files and resets to empty state", async () => {
      const { result } = renderHook(() => useFileUpload({ multiple: true }));

      act(() => {
        result.current.addFiles([
          createFile("a.png", 100, "image/png"),
          createFile("b.png", 200, "image/png"),
        ]);
      });

      await act(async () => {
        await result.current.cancelAll();
      });

      expect(result.current.files).toEqual([]);
      expect(result.current.totalFiles).toBe(0);
      expect(result.current.isUploading).toBe(false);
    });

    it("sends DELETE for every successfully uploaded file", async () => {
      mockFetch
        .mockResolvedValueOnce(successResponse("/uploads/a.png"))
        .mockResolvedValueOnce(successResponse("/uploads/b.png"));

      const { result } = renderHook(() => useFileUpload({ multiple: true }));

      act(() => {
        result.current.addFiles([
          createFile("a.png", 100, "image/png"),
          createFile("b.png", 200, "image/png"),
        ]);
      });

      await act(async () => {
        await result.current.upload({ destination: "/uploads" });
      });

      mockFetch.mockClear();
      mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

      await act(async () => {
        await result.current.cancelAll();
      });

      // Two DELETE calls
      expect(mockFetch).toHaveBeenCalledTimes(2);
      for (const [url, options] of mockFetch.mock.calls) {
        expect(options.method).toBe("DELETE");
      }

      expect(result.current.files).toEqual([]);
    });

    it("aborts in-flight uploads and deletes completed ones", async () => {
      const d = deferred<Response>();

      // First file uploads instantly, second hangs
      mockFetch
        .mockResolvedValueOnce(successResponse("/uploads/done.png"))
        .mockReturnValueOnce(d.promise);

      const { result } = renderHook(() => useFileUpload({ multiple: true }));

      act(() => {
        result.current.addFiles([
          createFile("done.png", 100, "image/png"),
          createFile("pending.png", 200, "image/png"),
        ]);
      });

      let uploadPromise: Promise<void>;
      act(() => {
        uploadPromise = result.current.upload({ destination: "/uploads" });
      });

      // Mock DELETEs for cancelAll
      mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

      await act(async () => {
        await result.current.cancelAll();
      });

      expect(result.current.files).toEqual([]);
      expect(result.current.isUploading).toBe(false);

      // Clean up
      d.resolve(successResponse("/uploads/pending.png"));
      await act(async () => {
        await uploadPromise;
      });
    });

    it("handles mixed states: selected, uploaded, errored", async () => {
      mockFetch
        .mockResolvedValueOnce(successResponse("/uploads/ok.png"))
        .mockRejectedValueOnce(new TypeError("fail"));

      const { result } = renderHook(() => useFileUpload({ multiple: true }));

      act(() => {
        result.current.addFiles([
          createFile("ok.png", 100, "image/png"),
          createFile("fail.png", 100, "image/png"),
        ]);
      });

      await act(async () => {
        await result.current.upload({ destination: "/uploads" });
      });

      // Add another selected file
      act(() => {
        result.current.addFiles([createFile("new.png", 100, "image/png")]);
      });

      expect(result.current.files).toHaveLength(3);

      mockFetch.mockClear();
      mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

      await act(async () => {
        await result.current.cancelAll();
      });

      // DELETE only for the one successful file
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.current.files).toEqual([]);
    });
  });
});
