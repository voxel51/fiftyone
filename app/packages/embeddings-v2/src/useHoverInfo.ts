import { useEffect, useRef, useState } from "react";
import type { HoverContent } from "./HoverCard";
import { fetchSampleInfo, type SampleInfo } from "./protocol";
import type { HoverHit } from "./renderer";

/**
 * Hover -> lazy sample info, cached per run/field/index. `mediaUrl`
 * maps a server media path to a browser URL (the App's getSampleSrc)
 * — injected because URL resolution is deployment-specific.
 * `pointSwatch` resolves a wire-order index to the point's rendered
 * color, so the card's value line matches the plot exactly.
 */
export function useHoverInfo(
  datasetName: string | null,
  brainKey: string | null,
  colorField: string | null,
  mediaUrl: (media: string) => string,
  pointSwatch?: (index: number) => string | null,
  /** Builds hover content SYNCHRONOUSLY from data the client already holds,
   * skipping the sample-info fetch. A run whose media is expensive to fetch
   * and decode (an extension-owned run reading its own storage) shows cheap
   * per-point detail instead of an image. Returns null to fall through to
   * the normal fetch path. */
  localDetail?: (hit: HoverHit) => HoverContent | null,
): {
  hover: HoverContent | null;
  handleHover: (hit: HoverHit | null) => void;
  /** Cancels a pending clear — call when the pointer enters the hover card,
   * so moving from the point onto the card's actions doesn't dismiss it */
  keepHover: () => void;
} {
  const [hover, setHover] = useState<HoverContent | null>(null);
  // The card doesn't vanish the instant the pointer leaves a point: a short
  // grace lets the pointer cross the gap onto the card to click an action
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClear = () => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
  };
  useEffect(() => () => cancelClear(), []);
  const hoverKeyRef = useRef<string | null>(null);
  const infoCache = useRef(new Map<string, SampleInfo>());

  // A new run reorders the wire, invalidating cached indices
  useEffect(() => {
    infoCache.current.clear();
    setHover(null);
  }, [datasetName, brainKey]);

  const handleHover = (hit: HoverHit | null) => {
    if (!hit || !datasetName || !brainKey) {
      hoverKeyRef.current = null;
      // Grace-delay the clear so the pointer can reach the card's actions
      cancelClear();
      clearTimer.current = setTimeout(() => setHover(null), CLEAR_GRACE_MS);
      return;
    }

    cancelClear();
    // The FULL request identity: a response for the same index but a
    // previous dataset/run/field must not land on the current hover
    const key = `${datasetName}::${brainKey}::${colorField ?? ""}::${hit.index}`;
    hoverKeyRef.current = key;
    const apply = (info: SampleInfo) => {
      // The pointer (or the run) may have moved on while this resolved
      if (hoverKeyRef.current !== key) return;

      let value: HoverContent["value"] = null;
      if (info.value !== null && info.value !== undefined) {
        const raw = info.value;
        const label =
          typeof raw === "number"
            ? String(Number(raw.toFixed(4)))
            : String(raw);
        value = { label, swatch: pointSwatch?.(hit.index) ?? null };
      }

      setHover({
        hit,
        src: info.media ? mediaUrl(info.media) : null,
        value,
        filename: info.filepath
          ? (info.filepath.split(/[\\/]/).pop() ?? null)
          : null,
      });
    };

    // Client-side detail wins: no request, no media decode
    const local = localDetail?.(hit);
    if (local) {
      setHover(local);
      return;
    }

    const cached = infoCache.current.get(key);
    if (cached) {
      apply(cached);
      return;
    }
    fetchSampleInfo(datasetName, brainKey, hit.index, colorField)
      .then((info) => {
        infoCache.current.set(key, info);
        apply(info);
      })
      .catch(() => undefined);
  };

  return { hover, handleHover, keepHover: cancelClear };
}

/** How long the card survives the pointer leaving a point. */
const CLEAR_GRACE_MS = 260;
