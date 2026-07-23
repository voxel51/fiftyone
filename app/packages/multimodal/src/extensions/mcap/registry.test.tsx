import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McapTimelineExtension } from "./types";
import {
  registerMcapTimelineExtension,
  resetMcapTimelineExtensionsForTests,
} from "./registry";

const extension: McapTimelineExtension = {
  id: "test:registry",
  order: 1,
  // eslint-disable-next-line react/prop-types
  Component: ({ children }) =>
    React.createElement(React.Fragment, null, children({})),
};

afterEach(async () => {
  resetMcapTimelineExtensionsForTests();
  const current = await import("./registry");
  current.resetMcapTimelineExtensionsForTests();
});

describe("MCAP timeline extension registry", () => {
  it("shares one registry across duplicate module evaluations", async () => {
    registerMcapTimelineExtension(extension);
    vi.resetModules();
    const reloaded = await import("./registry");

    expect(() =>
      reloaded.registerMcapTimelineExtension({ ...extension }),
    ).toThrow("Duplicate MCAP timeline extension id: test:registry");
  });

  it("keeps cleanup scoped to the object that owns the registration", () => {
    const unregister = registerMcapTimelineExtension(extension);
    unregister();
    unregister();

    expect(() => registerMcapTimelineExtension({ ...extension })).not.toThrow();
  });
});
