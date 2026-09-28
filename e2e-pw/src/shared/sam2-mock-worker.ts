/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { BrowserContext, Page } from "@playwright/test";

/**
 * Mock SAM2 inference worker for e2e specs, run in a real Worker from a Blob
 * URL. It speaks the production `worker.ts` protocol and answers every decode
 * with a deterministic 8x8 all-foreground mask + bbox, so no weights download
 * and the saved detection renders a non-empty mask.
 */
export const SAM2_MOCK_WORKER_SRC = `
  self.onmessage = (e) => {
    const { id, type } = e.data;
    if (type === "init") return;
    if (type === "loadModel") {
      self.postMessage({ id, type: "loadModel", success: true, result: undefined });
      return;
    }
    if (type === "embedAndDecode") {
      const mask = new Float32Array(64);
      for (let i = 0; i < 64; i++) mask[i] = 1;
      self.postMessage({ type: "status", result: "ready" });
      self.postMessage({
        id,
        type: "embedAndDecode",
        success: true,
        result: {
          mask,
          maskWidth: 8,
          maskHeight: 8,
          bbox: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
        },
      });
      return;
    }
  };
  self.postMessage({ type: "ready" });
`;

/**
 * Installs the mock worker through the `window.__FO_TEST_SAM2_WORKER_FACTORY`
 * seam before any page in `target` mounts `BrowserAnnotationProvider`.
 */
export const installSam2MockWorker = (target: Page | BrowserContext) =>
  target.addInitScript((workerSrc: string) => {
    (
      window as unknown as { __FO_TEST_SAM2_WORKER_FACTORY?: () => Worker }
    ).__FO_TEST_SAM2_WORKER_FACTORY = () => {
      const blob = new Blob([workerSrc], { type: "text/javascript" });
      return new Worker(URL.createObjectURL(blob));
    };
  }, SAM2_MOCK_WORKER_SRC);
