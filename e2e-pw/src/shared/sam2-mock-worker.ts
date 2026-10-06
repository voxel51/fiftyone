/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { BrowserContext, Page } from "@playwright/test";

/**
 * Mock SAM2 inference worker for e2e specs, served as the worker script. It
 * speaks the production `worker.ts` protocol and answers every decode with a
 * deterministic 8x8 all-foreground mask + bbox, so no weights download and the
 * saved detection renders a non-empty mask.
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
 * The SAM2 worker script `BrowserAnnotationProvider` loads: the hashed
 * `assets/worker-*.js` chunk of a build, or the source module under the dev
 * server
 */
const SAM2_WORKER_URL =
  /\/(assets\/worker-[\w-]+\.js|annotation\/src\/providers\/worker\.ts)(\?|$)/;

/**
 * Serves the mock in place of the SAM2 worker script for every page in
 * `target`; install before the page mounts `BrowserAnnotationProvider`.
 */
export const installSam2MockWorker = (target: Page | BrowserContext) =>
  target.route(SAM2_WORKER_URL, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: SAM2_MOCK_WORKER_SRC,
    }),
  );
