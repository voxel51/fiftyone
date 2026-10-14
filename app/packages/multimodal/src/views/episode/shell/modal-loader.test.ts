import { afterEach, expect, it, vi } from "vitest";
import {
  loadFormatAdapter,
  registerFormatAdapter,
  resetFormatAdapterRegistryForTests,
} from "../../../runtime/adapter-registry";
import { scheduleEpisodeModalPreload } from "./modal-loader";

vi.mock("./ModalRenderer", () => ({ ModalRenderer: () => null }));

afterEach(() => {
  resetFormatAdapterRegistryForTests();
  vi.unstubAllGlobals();
});

it("schedules each registered format once, including after switching datasets", async () => {
  const callbacks: IdleRequestCallback[] = [];
  vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  const adapters = ["mcap", "lerobot"].map((id) => {
    const adapter = { id, open: vi.fn() };
    const load = vi.fn(async () => adapter);
    registerFormatAdapter({
      detect: (sample) => sample.path === id,
      id,
      load,
    });
    return { adapter, load };
  });

  scheduleEpisodeModalPreload({ path: "mcap" });
  scheduleEpisodeModalPreload({ path: "mcap" });
  scheduleEpisodeModalPreload({ path: "lerobot" });
  await vi.waitFor(() => expect(callbacks).toHaveLength(2));
  for (const { load } of adapters) expect(load).not.toHaveBeenCalled();

  for (const callback of callbacks) {
    callback({ didTimeout: false, timeRemaining: () => 10 });
  }
  for (const { adapter, load } of adapters) {
    expect(await loadFormatAdapter({ path: adapter.id })).toBe(adapter);
    expect(load).toHaveBeenCalledTimes(1);
    expect(adapter.open).not.toHaveBeenCalled();
  }
});
