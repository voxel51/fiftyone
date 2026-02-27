import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useFileUpload } from "../useFileUpload";
import {
  createFile,
  createMockTransport,
  setupFetchMock,
  type TransportPostOptions,
} from "./helpers";

setupFetchMock();

// Progress updates are batched via requestAnimationFrame. In jsdom the
// real RAF never fires, so we replace it with a synchronous flush.
let rafCallbacks: Array<FrameRequestCallback> = [];
beforeEach(() => {
  rafCallbacks = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function flushRAF() {
  const cbs = rafCallbacks.splice(0);
  cbs.forEach((cb) => cb(performance.now()));
}

describe("upload — progress", () => {
  it("starts progress at 0 when upload begins", async () => {
    const { transport, post } = createMockTransport();
    let capturedOnProgress: ((p: number) => void) | undefined;

    post.mockImplementation(
      async (_url: string, _file: File, options: TransportPostOptions) => {
        capturedOnProgress = options.onProgress;
        return { path: "/uploads/a.png" };
      }
    );

    const { result } = renderHook(() => useFileUpload({ transport }));

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    expect(capturedOnProgress).toBeDefined();
  });

  it("reflects intermediate progress from the transport", async () => {
    const { transport, post } = createMockTransport();
    let triggerProgress!: (p: number) => void;
    let completeUpload!: () => void;

    post.mockImplementation(
      (_url: string, _file: File, options: TransportPostOptions) => {
        triggerProgress = options.onProgress!;
        return new Promise((resolve) => {
          completeUpload = () => resolve({ path: "/uploads/a.png" });
        });
      }
    );

    const { result } = renderHook(() => useFileUpload({ transport }));

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    let uploadPromise: Promise<void>;
    act(() => {
      uploadPromise = result.current.upload({ destination: "/uploads" });
    });

    expect(result.current.files[0].status).toBe("uploading");
    expect(result.current.files[0].progress).toBe(0);

    act(() => {
      triggerProgress(50);
      flushRAF();
    });
    expect(result.current.files[0].progress).toBe(50);

    act(() => {
      triggerProgress(90);
      flushRAF();
    });
    expect(result.current.files[0].progress).toBe(90);

    await act(async () => {
      completeUpload();
      await uploadPromise!;
    });

    expect(result.current.files[0].progress).toBe(100);
    expect(result.current.files[0].status).toBe("success");
  });

  it("reports per-file progress independently", async () => {
    const { transport, post } = createMockTransport();
    const triggers: Array<(p: number) => void> = [];
    const completers: Array<() => void> = [];

    post.mockImplementation(
      (_url: string, file: File, options: TransportPostOptions) => {
        triggers.push(options.onProgress!);
        return new Promise((resolve) => {
          completers.push(() => resolve({ path: `/uploads/${file.name}` }));
        });
      }
    );

    const { result } = renderHook(() =>
      useFileUpload({ multiple: true, transport })
    );

    act(() => {
      result.current.addFiles([
        createFile("a.png", 100, "image/png"),
        createFile("b.png", 200, "image/png"),
      ]);
    });

    let uploadPromise: Promise<void>;
    act(() => {
      uploadPromise = result.current.upload({ destination: "/uploads" });
    });

    act(() => {
      triggers[0](30);
      triggers[1](70);
      flushRAF();
    });

    expect(result.current.files[0].progress).toBe(30);
    expect(result.current.files[1].progress).toBe(70);

    await act(async () => {
      completers[0]();
      completers[1]();
      await uploadPromise!;
    });

    expect(result.current.files[0].progress).toBe(100);
    expect(result.current.files[1].progress).toBe(100);
  });
});
