import { useMemo, useRef } from "react";

import type { PointCloudVisualization } from "../../../../ir/index";
import type { StreamPlaybackFrame } from "../../playback/use-stream-values";

/**
 * Color channels a point-cloud stream has been observed to carry: the
 * decoded scalar field names (decoder order preserved) and whether the
 * cloud ships explicit RGB colors.
 */
export interface PointCloudColorCapabilities {
  readonly hasRgb: boolean;
  readonly scalarFields: readonly string[];
}

interface MutableCapabilities {
  hasRgb: boolean;
  readonly scalarFieldOrder: string[];
  readonly scalarFieldNames: Set<string>;
}

/**
 * Accumulates per-stream color capabilities from the streams' playback
 * frames. Accumulating (rather than deriving from the current tick alone)
 * keeps the settings UI stable when individual messages drop a channel —
 * e.g. a LaserScan whose malformed intensities were discarded for one
 * message. The returned map identity only changes when a new channel is
 * discovered, not on every playback tick.
 */
export function usePointCloudColorCapabilities(
  streams: readonly string[],
  frames: readonly (StreamPlaybackFrame<PointCloudVisualization> | null)[],
): ReadonlyMap<string, PointCloudColorCapabilities> {
  const accumulatedRef = useRef(new Map<string, MutableCapabilities>());

  // Render-time accumulation into a ref: idempotent and monotonic (channels
  // are only ever added), so re-renders and StrictMode double-invocations
  // are safe.
  const accumulated = accumulatedRef.current;
  streams.forEach((stream, index) => {
    const frame = frames[index]?.frame;
    if (!frame) {
      return;
    }

    let capabilities = accumulated.get(stream);
    if (!capabilities) {
      capabilities = {
        hasRgb: false,
        scalarFieldNames: new Set<string>(),
        scalarFieldOrder: [],
      };
      accumulated.set(stream, capabilities);
    }

    if (frame.colors) {
      capabilities.hasRgb = true;
    }
    for (const scalarField of frame.scalarFields ?? []) {
      if (!capabilities.scalarFieldNames.has(scalarField.name)) {
        capabilities.scalarFieldNames.add(scalarField.name);
        capabilities.scalarFieldOrder.push(scalarField.name);
      }
    }
  });

  const signature = streams
    .map((stream) => {
      const capabilities = accumulated.get(stream);
      if (!capabilities) {
        return stream;
      }
      return `${stream}:${capabilities.hasRgb ? "rgb" : ""}:${capabilities.scalarFieldOrder.join(",")}`;
    })
    .join("|");

  return useMemo(() => {
    const result = new Map<string, PointCloudColorCapabilities>();
    for (const stream of streams) {
      const capabilities = accumulated.get(stream);
      if (!capabilities) {
        continue;
      }
      result.set(stream, {
        hasRgb: capabilities.hasRgb,
        scalarFields: [...capabilities.scalarFieldOrder],
      });
    }
    return result;
    // The signature captures exactly the accumulated content this map is
    // built from; streams/accumulated identities are deliberately excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
