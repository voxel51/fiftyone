import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdapterDescriptor } from "../ports";
import {
  findFormatAdapterDescriptor,
  getFormatAdapterDescriptors,
  loadFormatAdapter,
  registerFormatAdapter,
  resetFormatAdapterRegistryForTests,
} from "./adapter-registry";

afterEach(resetFormatAdapterRegistryForTests);

describe("format adapter registry", () => {
  it("detects cheaply and does not load until requested", async () => {
    const adapter = { id: "fixture", open: vi.fn() };
    const load = vi.fn(async () => adapter);
    const descriptor: AdapterDescriptor = {
      detect: (sample) => sample.path?.endsWith(".fixture") ?? false,
      id: "fixture",
      load,
    };
    const unregister = registerFormatAdapter(descriptor);

    expect(getFormatAdapterDescriptors()).toEqual([descriptor]);
    expect(await findFormatAdapterDescriptor({ path: "episode.fixture" })).toBe(
      descriptor,
    );
    expect(load).not.toHaveBeenCalled();
    expect(await loadFormatAdapter({ path: "episode.fixture" })).toBe(adapter);
    expect(load).toHaveBeenCalledTimes(1);

    unregister();
    expect(getFormatAdapterDescriptors()).toEqual([]);
  });

  it("keeps a consumer's lifecycle signal out of the shared code load", async () => {
    const controller = new AbortController();
    const adapter = { id: "fixture", open: vi.fn() };
    const detect = vi.fn(async () => true);
    const load = vi.fn(async () => adapter);
    registerFormatAdapter({ detect, id: "fixture", load });

    await expect(
      loadFormatAdapter(
        { path: "episode.fixture" },
        { signal: controller.signal },
      ),
    ).resolves.toBe(adapter);
    expect(detect).toHaveBeenCalledWith(
      { path: "episode.fixture" },
      { signal: controller.signal },
    );
    expect(load).toHaveBeenCalledWith();
  });

  it("shares preloading with an open without opening a source", async () => {
    let finishExtensions!: () => void;
    const extensions = new Promise<void>((resolve) => {
      finishExtensions = resolve;
    });
    const adapter = { id: "fixture", open: vi.fn() };
    const load = vi.fn(async () => {
      await extensions;
      return adapter;
    });
    registerFormatAdapter({ detect: () => true, id: "fixture", load });
    const controller = new AbortController();
    const cancelled = loadFormatAdapter({}, { signal: controller.signal });
    const preload = loadFormatAdapter({});
    const open = loadFormatAdapter({});
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    controller.abort();
    finishExtensions();

    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    await expect(preload).resolves.toBe(adapter);
    await expect(open).resolves.toBe(adapter);
    expect(adapter.open).not.toHaveBeenCalled();
    expect(await loadFormatAdapter({})).toBe(adapter);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("retries a failed preload and discards replaced registrations", async () => {
    const adapter = { id: "fixture", open: vi.fn() };
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(adapter);
    const unregister = registerFormatAdapter({
      detect: () => true,
      id: "fixture",
      load,
    });
    await expect(loadFormatAdapter({})).rejects.toThrow("offline");
    await expect(loadFormatAdapter({})).resolves.toBe(adapter);
    expect(load).toHaveBeenCalledTimes(2);

    const replacement = { id: "fixture", open: vi.fn() };
    registerFormatAdapter({
      detect: () => true,
      id: "fixture",
      load: async () => replacement,
    });
    unregister();
    await expect(loadFormatAdapter({})).resolves.toBe(replacement);
  });

  it("does not continue detection or loading after cancellation", async () => {
    const controller = new AbortController();
    const secondDetect = vi.fn(() => true);
    registerFormatAdapter({
      detect: async () => {
        controller.abort();
        return false;
      },
      id: "first",
      load: vi.fn(),
    });
    registerFormatAdapter({
      detect: secondDetect,
      id: "second",
      load: vi.fn(),
    });

    await expect(
      loadFormatAdapter(
        { path: "episode.fixture" },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(secondDetect).not.toHaveBeenCalled();
  });
});
