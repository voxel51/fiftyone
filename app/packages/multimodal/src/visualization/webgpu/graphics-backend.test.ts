import { describe, expect, it } from "vitest";

import {
  GRAPHICS_BACKEND_QUERY_PARAMETER,
  graphicsBackendForRenderer,
  requestedGraphicsBackend,
} from "./graphics-backend";

describe("graphics backend compatibility", () => {
  it("reads Three's initialized backend flags", () => {
    expect(
      graphicsBackendForRenderer({ backend: { isWebGPUBackend: true } }),
    ).toBe("webgpu");
    expect(
      graphicsBackendForRenderer({ backend: { isWebGLBackend: true } }),
    ).toBe("webgl2");
  });

  it("rejects an uninitialized or unknown backend", () => {
    expect(() => graphicsBackendForRenderer({ backend: {} })).toThrow(
      "without a recognized backend",
    );
  });

  it("accepts only the supported WebGL2 diagnostic query value", () => {
    expect(GRAPHICS_BACKEND_QUERY_PARAMETER).toBe("graphicsBackend");
    expect(requestedGraphicsBackend("?graphicsBackend=webgl2")).toBe("webgl2");
    expect(requestedGraphicsBackend("?graphicsBackend=auto")).toBe("auto");
    expect(requestedGraphicsBackend("?graphicsBackend=webgpu")).toBe("auto");
    expect(requestedGraphicsBackend("?graphicsBackend=WEBGL2")).toBe("auto");
    expect(requestedGraphicsBackend("?other=webgl2")).toBe("auto");
  });
});
