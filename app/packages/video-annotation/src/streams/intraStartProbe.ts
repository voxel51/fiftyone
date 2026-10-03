/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/// <reference types="dom-webcodecs" />

import type { IntraStarts } from "./keyframeIndex";
import { intraStartPointChunk, isIntraOnlySample } from "./intraStartPoints";

/**
 * Decoding from an all-intra picture, gated on whether this browser accepts
 * one. Only newer Chromium treats a recovery point as a start point; an older
 * one rejects the chunk and fails everything fed with it. So the first
 * candidate is decoded once on its own (`decodes`), and the answer holds for
 * the rest of the source.
 */
export function intraStarts(
  nalLengthSize: number,
  decodes: (chunk: Uint8Array) => Promise<boolean>,
): IntraStarts {
  let supported: Promise<boolean> | null = null;
  let unsupported = false;

  return {
    candidate: (data) => !unsupported && isIntraOnlySample(data, nalLengthSize),

    async chunk(data) {
      if (unsupported) {
        return null;
      }

      const chunk = intraStartPointChunk(data, nalLengthSize);
      if (!chunk) {
        return null;
      }

      supported ??= decodes(chunk).catch(() => false);
      if (!(await supported)) {
        unsupported = true;
        return null;
      }

      return chunk;
    },
  };
}

/** Whether a fresh decoder produces a frame from `chunk` as its first input. */
export function decodesAsStart(
  config: VideoDecoderConfig,
  chunk: Uint8Array,
): Promise<boolean> {
  return new Promise((resolve) => {
    let frames = 0;
    const decoder = new VideoDecoder({
      output: (frame) => {
        frames += 1;
        frame.close();
      },
      error: () => resolve(false),
    });

    const close = () => {
      if (decoder.state !== "closed") {
        decoder.close();
      }
    };

    try {
      decoder.configure(config);
      decoder.decode(
        new EncodedVideoChunk({ type: "key", timestamp: 0, data: chunk }),
      );
    } catch {
      close();
      resolve(false);
      return;
    }

    decoder
      .flush()
      .then(
        () => resolve(frames > 0),
        () => resolve(false),
      )
      .finally(close);
  });
}
