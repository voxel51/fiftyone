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
});
