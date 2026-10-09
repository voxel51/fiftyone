import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSceneModelUrlResolver,
  registerSceneModelCloudResolver,
} from "./scene-model-urls";
import { loadSceneModelAsset } from "./scene-models";

let unregister: (() => void) | undefined;
afterEach(() => {
  unregister?.();
  unregister = undefined;
  vi.unstubAllGlobals();
});

describe("cloud scene models", () => {
  it.each(["gs", "s3", "az"])(
    "signs %s models and their relative resources",
    async (scheme) => {
      const sign = vi.fn(
        async (path: string) =>
          `https://signed.example/${encodeURIComponent(path)}`,
      );
      unregister = registerSceneModelCloudResolver(sign);
      const model = `${scheme}://bucket/models/robot.gltf`;
      const resolve = createSceneModelUrlResolver(model);
      await resolve(model);
      await Promise.all([resolve("../mesh.bin"), resolve("../mesh.bin")]);
      await resolve("textures/base.png");
      expect(sign.mock.calls.map(([path]) => path)).toEqual([
        model,
        `${scheme}://bucket/mesh.bin`,
        `${scheme}://bucket/models/textures/base.png`,
      ]);
    },
  );

  it("preserves browser URLs and resolves explicit cloud dependencies of inline models", async () => {
    const sign = vi.fn(async () => "https://signed.example/texture.png");
    unregister = registerSceneModelCloudResolver(sign);
    const resolve = createSceneModelUrlResolver("blob:model");
    for (const uri of [
      "https://example.com/a?signature=x",
      "data:image/png;base64,AA==",
      "blob:texture",
      "relative.bin",
    ]) {
      expect(await resolve(uri)).toBe(uri);
    }
    expect(sign).not.toHaveBeenCalled();
    expect(await resolve("az://bucket/texture.png")).toBe(
      "https://signed.example/texture.png",
    );
  });

  it("reports unavailable signing and invalid signing responses", async () => {
    await expect(
      createSceneModelUrlResolver("gs://bucket/a.glb")("gs://bucket/a.glb"),
    ).rejects.toThrow("require a cloud-storage URL resolver");
    unregister = registerSceneModelCloudResolver(
      async () => "gs://still-private/a.glb",
    );
    await expect(
      createSceneModelUrlResolver("gs://bucket/a.glb")("gs://bucket/a.glb"),
    ).rejects.toThrow("valid signed model URL");
  });

  it.each(["gltf", "glb"])(
    "loads a real %s mesh using separately signed model and buffer URLs",
    async (extension) => {
      const sign = vi.fn(async (path: string) =>
        !path.endsWith(".bin")
          ? "https://signed.example/model?token=model"
          : "https://signed.example/buffer?token=buffer",
      );
      unregister = registerSceneModelCloudResolver(sign);
      const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const gltf = {
        asset: { version: "2.0" },
        buffers: [{ uri: "../geometry.bin", byteLength: positions.byteLength }],
        bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
        accessors: [
          {
            bufferView: 0,
            componentType: 5126,
            count: 3,
            type: "VEC3",
            min: [0, 0, 0],
            max: [1, 1, 0],
          },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        nodes: [{ mesh: 0 }],
        scenes: [{ nodes: [0] }],
        scene: 0,
      };
      const fetch = vi.fn(async (request: Request) => {
        if (request.url === "https://signed.example/model?token=model")
          return new Response(
            extension === "glb" ? glbJson(gltf) : JSON.stringify(gltf),
          );
        if (request.url === "https://signed.example/buffer?token=buffer")
          return new Response(positions.buffer);
        throw new Error(`Unexpected request: ${request.url}`);
      });
      vi.stubGlobal("fetch", fetch);
      const asset = {
        cacheKey: `test:cloud-triangle:${extension}`,
        url: `gs://bucket/models/triangle.${extension}`,
      };
      const first = loadSceneModelAsset(asset);
      expect(loadSceneModelAsset(asset)).toBe(first);
      const scene = await first;
      expect(scene.children[0].type).toBe("Mesh");
      expect(sign.mock.calls.map(([path]) => path)).toEqual([
        asset.url,
        "gs://bucket/geometry.bin",
      ]);
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it("signs again after a failed load so a retry can recover", async () => {
    const sign = vi
      .fn()
      .mockRejectedValueOnce(new Error("Expired credentials"))
      .mockResolvedValue("https://signed.example/retry.glb");
    unregister = registerSceneModelCloudResolver(sign);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ asset: { version: "2.0" }, scenes: [{}] }),
          ),
      ),
    );
    const asset = {
      cacheKey: "test:retry-cloud-model",
      url: "s3://bucket/retry.glb",
    };
    await expect(loadSceneModelAsset(asset)).rejects.toThrow(
      "Expired credentials",
    );
    await expect(loadSceneModelAsset(asset)).resolves.toMatchObject({
      type: "Group",
    });
    expect(sign).toHaveBeenCalledTimes(2);
  });
});

function glbJson(json: object): ArrayBuffer {
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  const paddedLength = Math.ceil(bytes.byteLength / 4) * 4;
  const buffer = new ArrayBuffer(20 + paddedLength);
  const header = new DataView(buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, buffer.byteLength, true);
  header.setUint32(12, paddedLength, true);
  header.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20).fill(0x20);
  new Uint8Array(buffer, 20).set(bytes);
  return buffer;
}
