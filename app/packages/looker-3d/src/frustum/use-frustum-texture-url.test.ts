import { getFetchFunction } from "@fiftyone/utilities";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFrustumTextureUrl } from "./use-frustum-texture-url";

vi.mock("@fiftyone/utilities", () => ({
  getFetchFunction: vi.fn(),
}));

const mockGetFetchFunction = vi.mocked(getFetchFunction);
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
type Fetch = ReturnType<typeof getFetchFunction>;

describe("useFrustumTextureUrl", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let fetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:frustum-1")
      .mockReturnValueOnce("blob:frustum-2");
    revokeObjectURL = vi.fn();
    fetch = vi.fn().mockResolvedValue(new Blob(["image"]));

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });

    mockGetFetchFunction.mockReturnValue(fetch as unknown as Fetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  });

  it("fetches an image URL as a blob and exposes an object URL", async () => {
    const { result, unmount } = renderHook(() =>
      useFrustumTextureUrl("http://localhost:5151/media?filepath=image.png")
    );

    expect(result.current).toBeNull();

    await waitFor(() => expect(result.current).toBe("blob:frustum-1"));

    expect(fetch).toHaveBeenCalledWith(
      "GET",
      "http://localhost:5151/media?filepath=image.png",
      undefined,
      "blob"
    );

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:frustum-1");
  });

  it("revokes the previous object URL when the image URL changes", async () => {
    const { result, rerender, unmount } = renderHook(
      ({ imageUrl }) => useFrustumTextureUrl(imageUrl),
      {
        initialProps: {
          imageUrl: "http://localhost:5151/media?filepath=image-1.png",
        },
      }
    );

    await waitFor(() => expect(result.current).toBe("blob:frustum-1"));

    rerender({
      imageUrl: "http://localhost:5151/media?filepath=image-2.png",
    });

    await waitFor(() => expect(result.current).toBe("blob:frustum-2"));

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:frustum-1");

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:frustum-2");
  });

  it("does not fetch when no image URL is available", () => {
    const { result } = renderHook(() => useFrustumTextureUrl(undefined));

    expect(result.current).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
