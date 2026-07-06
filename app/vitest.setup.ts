/**
 * Global test setup for Vitest
 * This file is executed before running tests to set up the test environment
 */

// Testing Library queries target the repo-wide `data-cy` attribute (the
// data-testid → data-cy rename). Guarded: packages without Testing
// Library must still load this setup.
try {
  const { configure } = await import("@testing-library/react");
  configure({ testIdAttribute: "data-cy" });
} catch {
  // Package doesn't depend on Testing Library.
}

// Mock window.URL.createObjectURL and revokeObjectURL
// These are browser APIs that aren't available in jsdom but are required by
// libraries like plotly.js/mapbox-gl
if (typeof window !== "undefined") {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  window.URL.createObjectURL = () => "mock-object-url";
  window.URL.revokeObjectURL = () => {};

  // jsdom has no matchMedia; uplot queries it at module load to track
  // devicePixelRatio changes.
  window.matchMedia ??= ((query: string) => ({
    addEventListener: () => {},
    addListener: () => {},
    dispatchEvent: () => false,
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: () => {},
    removeListener: () => {},
  })) as unknown as typeof window.matchMedia;

  // Mock HTMLCanvasElement.prototype.getContext before any modules load
  // This is required by plotly.js which tries to use canvas during module initialization
  const mockContext = {
    fillRect: () => {},
    clearRect: () => {},
    getImageData: () => ({ data: new Array(4) }),
    putImageData: () => {},
    createImageData: () => [],
    setTransform: () => {},
    drawImage: () => {},
    save: () => {},
    fillText: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    stroke: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    arc: () => {},
    fill: () => {},
    measureText: () => ({ width: 0 }),
    transform: () => {},
    rect: () => {},
    clip: () => {},
  };

  HTMLCanvasElement.prototype.getContext = function () {
    return mockContext;
  } as any;

  HTMLCanvasElement.prototype.toDataURL = function () {
    return "";
  };
}
