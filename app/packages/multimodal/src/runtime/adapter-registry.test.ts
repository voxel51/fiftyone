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
    const load = vi.fn(() => Promise.resolve(adapter));
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

  it("forwards one lifecycle signal through detection and loading", async () => {
    const controller = new AbortController();
    const adapter = { id: "fixture", open: vi.fn() };
    const detect = vi.fn(() => Promise.resolve(true));
    const load = vi.fn(() => Promise.resolve(adapter));
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
    expect(load).toHaveBeenCalledWith({ signal: controller.signal });
  });

  it("does not continue detection or loading after cancellation", async () => {
    const controller = new AbortController();
    const secondDetect = vi.fn(() => true);
    registerFormatAdapter({
      detect: () => {
        controller.abort();
        return Promise.resolve(false);
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
