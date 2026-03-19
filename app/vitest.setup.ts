/**
 * Global test setup for Vitest
 * This file is executed before running tests to set up the test environment
 */

// Mock window.URL.createObjectURL and revokeObjectURL
// These are browser APIs that aren't available in jsdom but are required by
// libraries like plotly.js/mapbox-gl
if (typeof window !== "undefined") {
  window.URL.createObjectURL = () => "mock-object-url";
  window.URL.revokeObjectURL = () => {};

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
