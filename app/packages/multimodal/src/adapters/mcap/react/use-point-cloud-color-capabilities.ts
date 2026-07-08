import { useMemo, useRef } from "react";

import type { PointCloudVisualization } from "../../../decoders";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

/**
 * Color channels a point-cloud topic has been observed to carry: the
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
 * Accumulates per-topic color capabilities from the topics' playback
 * frames. Accumulating (rather than deriving from the current tick alone)
 * keeps the settings UI stable when individual messages drop a channel —
 * e.g. a LaserScan whose malformed intensities were discarded for one
 * message. The returned map identity only changes when a new channel is
 * discovered, not on every playback tick.
 */
export function usePointCloudColorCapabilities(
  topics: readonly string[],
  frames: readonly (McapTopicPlaybackFrame<PointCloudVisualization> | null)[],
): ReadonlyMap<string, PointCloudColorCapabilities> {
  const accumulatedRef = useRef(new Map<string, MutableCapabilities>());

  // Render-time accumulation into a ref: idempotent and monotonic (channels
  // are only ever added), so re-renders and StrictMode double-invocations
  // are safe.
  const accumulated = accumulatedRef.current;
  topics.forEach((topic, index) => {
    const frame = frames[index]?.frame;
    if (!frame) {
      return;
    }

    let capabilities = accumulated.get(topic);
    if (!capabilities) {
      capabilities = {
        hasRgb: false,
        scalarFieldNames: new Set<string>(),
        scalarFieldOrder: [],
      };
      accumulated.set(topic, capabilities);
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

  const signature = topics
    .map((topic) => {
      const capabilities = accumulated.get(topic);
      if (!capabilities) {
        return topic;
      }
      return `${topic}:${capabilities.hasRgb ? "rgb" : ""}:${capabilities.scalarFieldOrder.join(",")}`;
    })
    .join("|");

  return useMemo(() => {
    const result = new Map<string, PointCloudColorCapabilities>();
    for (const topic of topics) {
      const capabilities = accumulated.get(topic);
      if (!capabilities) {
        continue;
      }
      result.set(topic, {
        hasRgb: capabilities.hasRgb,
        scalarFields: [...capabilities.scalarFieldOrder],
      });
    }
    return result;
    // The signature captures exactly the accumulated content this map is
    // built from; topics/accumulated identities are deliberately excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
