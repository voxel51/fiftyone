/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Mock SAM2 inference worker for e2e specs. Returns a deterministic
 * all-foreground mask + bbox so AI-assisted segmentation tests don't have
 * to download model weights or run ONNX.
 *
 * Installed via the `window.__FO_TEST_SAM2_WORKER_FACTORY` seam on
 * `BrowserAnnotationProvider`. The source string is wrapped in a Blob URL
 * by the test setup so it runs in a real Worker context — `self.onmessage`
 * and `self.postMessage` work as in the production `worker.ts`.
 *
 * The protocol mirrors `app/packages/annotation/src/providers/worker.ts`:
 *   - emit `{ type: "ready" }` once on startup
 *   - `init` → no response
 *   - `loadModel` → `{ id, type, success: true, result: undefined }`
 *   - `embedAndDecode` → `{ id, type, success: true, result }` where result
 *     is `{ mask: Float32Array, maskWidth, maskHeight, bbox: {x,y,w,h} }`
 *
 * The mask is 8x8 all-ones (foreground) so the agent's `normalizeMask`
 * (thresholded at >0.5) yields 64 foreground pixels, which after the
 * agent's encode + the server-side save round-trip, the spec can verify
 * with `annotateSDK.getDetectionsState(...).maskPixels > 0`.
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
