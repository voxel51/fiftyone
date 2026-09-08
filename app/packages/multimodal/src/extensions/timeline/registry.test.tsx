import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimelineExtension } from "./types";
import {
  registerTimelineExtension,
  resetTimelineExtensionsForTests,
} from "./registry";

const extension: TimelineExtension = {
  id: "test:registry",
  order: 1,
  // eslint-disable-next-line react/prop-types
  Component: ({ children }) =>
    React.createElement(React.Fragment, null, children({})),
};

afterEach(async () => {
  resetTimelineExtensionsForTests();
  const current = await import("./registry");
  current.resetTimelineExtensionsForTests();
});

describe("Timeline extension registry", () => {
  it("shares one registry across duplicate module evaluations", async () => {
    registerTimelineExtension(extension);
    vi.resetModules();
    const reloaded = await import("./registry");

    expect(() => reloaded.registerTimelineExtension({ ...extension })).toThrow(
      "Duplicate timeline extension id: test:registry",
    );
  });

  it("keeps cleanup scoped to the object that owns the registration", () => {
    const unregister = registerTimelineExtension(extension);
    unregister();
    unregister();

    expect(() => registerTimelineExtension({ ...extension })).not.toThrow();
  });
});
