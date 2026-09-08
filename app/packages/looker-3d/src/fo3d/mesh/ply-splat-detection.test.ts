import { afterEach, describe, expect, it, vi } from "vitest";
import { sniffPlyIsGaussianSplat } from "./ply-splat-detection";

const mocks = vi.hoisted(() => ({
  fetchAsset: vi.fn(),
}));

vi.mock("@fiftyone/utilities", () => ({
  getFetchFunctionExtended: () => mocks.fetchAsset,
}));

const SPLAT_HEADER = `ply
format binary_little_endian 1.0
element vertex 1
property float x
property float y
property float z
property float scale_0
property float scale_1
property float scale_2
property float rot_0
property float rot_1
property float rot_2
property float rot_3
end_header
`;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
};

const buildHeaderResponse = () => ({
  response: new Response(SPLAT_HEADER, { status: 206 }),
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("sniffPlyIsGaussianSplat", () => {
  it("shares and caches classification for the same URL", async () => {
    const request = deferred<ReturnType<typeof buildHeaderResponse>>();
    mocks.fetchAsset.mockReturnValue(request.promise);

    const first = sniffPlyIsGaussianSplat("cached-scene.ply");
    const second = sniffPlyIsGaussianSplat("cached-scene.ply");
    request.resolve(buildHeaderResponse());

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    await expect(sniffPlyIsGaussianSplat("cached-scene.ply")).resolves.toBe(
      true,
    );
    expect(mocks.fetchAsset).toHaveBeenCalledOnce();
  });

  it("lets one consumer abort without cancelling shared classification", async () => {
    const request = deferred<ReturnType<typeof buildHeaderResponse>>();
    mocks.fetchAsset.mockReturnValue(request.promise);
    const abortController = new AbortController();

    const abandoned = sniffPlyIsGaussianSplat(
      "shared-scene.ply",
      abortController.signal,
    );
    const active = sniffPlyIsGaussianSplat("shared-scene.ply");
    abortController.abort();
    request.resolve(buildHeaderResponse());

    await expect(abandoned).rejects.toMatchObject({ name: "AbortError" });
    await expect(active).resolves.toBe(true);
    expect(mocks.fetchAsset).toHaveBeenCalledOnce();
  });

  it("evicts failed classifications so a later request can retry", async () => {
    mocks.fetchAsset
      .mockRejectedValueOnce(new Error("range failed"))
      .mockRejectedValueOnce(new Error("full fetch failed"))
      .mockResolvedValueOnce(buildHeaderResponse());

    await expect(sniffPlyIsGaussianSplat("retry-scene.ply")).rejects.toThrow(
      "full fetch failed",
    );
    await expect(sniffPlyIsGaussianSplat("retry-scene.ply")).resolves.toBe(
      true,
    );
    expect(mocks.fetchAsset).toHaveBeenCalledTimes(3);
  });
});
