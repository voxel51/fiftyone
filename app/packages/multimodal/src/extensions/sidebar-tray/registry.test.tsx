import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerSidebarTrayExtension,
  resetSidebarTrayExtensionsForTests,
} from "./registry";
import type { SidebarTrayExtension } from "./types";

const extension: SidebarTrayExtension = {
  id: "test:tray",
  order: 1,
  Component: () => React.createElement("div"),
};

afterEach(async () => {
  resetSidebarTrayExtensionsForTests();
  const current = await import("./registry");
  current.resetSidebarTrayExtensionsForTests();
});

describe("Sidebar tray extension registry", () => {
  it("rejects an id that is not namespaced", () => {
    expect(() =>
      registerSidebarTrayExtension({ ...extension, id: "tray" }),
    ).toThrow("Sidebar tray extension ids must be namespaced: tray");
  });

  it("shares one registry across duplicate module evaluations", async () => {
    registerSidebarTrayExtension(extension);
    vi.resetModules();
    const reloaded = await import("./registry");

    // The slot is global, so the reloaded module sees the live registration.
    expect(reloaded.resetSidebarTrayExtensionsForTests).toBeTypeOf("function");
    expect(() =>
      reloaded.registerSidebarTrayExtension({ ...extension }),
    ).not.toThrow();
  });

  it("treats re-registering the same object as a no-op", () => {
    registerSidebarTrayExtension(extension);

    expect(() => registerSidebarTrayExtension(extension)).not.toThrow();
  });

  it("lets a replacement win, for a reload with no disposal hook", () => {
    const Replacement: SidebarTrayExtension["Component"] = () =>
      React.createElement("span");
    registerSidebarTrayExtension(extension);
    registerSidebarTrayExtension({ ...extension, Component: Replacement });

    expect(readSnapshot()).toHaveLength(1);
    expect(readSnapshot()[0]?.Component).toBe(Replacement);
  });

  it("keeps a superseded registration's cleanup from clearing its replacement", () => {
    const unregister = registerSidebarTrayExtension(extension);
    const replacement = { ...extension, order: 2 };
    registerSidebarTrayExtension(replacement);

    unregister();

    expect(readSnapshot()).toEqual([replacement]);
  });

  it("orders by explicit order, then id — never import order", () => {
    const late = { ...extension, id: "test:a-late", order: 9 };
    const early = { ...extension, id: "test:z-early", order: 1 };
    registerSidebarTrayExtension(late);
    registerSidebarTrayExtension(early);

    expect(readSnapshot().map(({ id }) => id)).toEqual([
      "test:z-early",
      "test:a-late",
    ]);
  });
});

/** Reads the live snapshot without standing up a React renderer. */
function readSnapshot(): readonly SidebarTrayExtension[] {
  const state = (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("@fiftyone/multimodal:sidebar-tray-extension-registry")
  ] as { snapshot: readonly SidebarTrayExtension[] };
  return state.snapshot;
}
