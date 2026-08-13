import { useCallback, useEffect, useRef, useState } from "react";
import type { HoverContent } from "./HoverCard";
import { fetchSampleInfo, type SampleInfo } from "./protocol";
import type { HoverHit } from "./renderer";

/**
 * A hit must survive this long before the card commits to it. The ring
 * (hoverHit) tracks instantly; fetching and showing a card for every
 * point crossed while gliding over a dense cloud would hammer the
 * network and flicker the card.
 */
const CARD_DWELL_MS = 125;

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
   * skipping the sample-info fetch — and the card dwell, which exists to
   * protect the network path. A run whose media is expensive to fetch
   * and decode (an extension-owned run reading its own storage) shows cheap
   * per-point detail instead of an image. Returns null to fall through to
   * the normal fetch path. */
  localDetail?: (hit: HoverHit) => HoverContent | null,
): {
  hover: HoverContent | null;
  /** The live hit, before the card's dwell — anchors the hover ring */
  hoverHit: HoverHit | null;
  handleHover: (hit: HoverHit | null) => void;
  /** Cancels a pending clear — call when the pointer enters the hover card,
   * so moving from the point onto the card's actions doesn't dismiss it */
  keepHover: () => void;
} {
  const [hover, setHover] = useState<HoverContent | null>(null);
  const [hoverHit, setHoverHit] = useState<HoverHit | null>(null);
  // The card doesn't vanish the instant the pointer leaves a point: a short
  // grace lets the pointer cross the gap onto the card to click an action
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable identity: consumers hand this to the hover card as keepHover,
  // and an every-render identity would re-bind listeners for no reason
  const cancelClear = useCallback(() => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
  }, []);
  const hoverKeyRef = useRef<string | null>(null);
  const dwellRef = useRef<number | null>(null);
  const infoCache = useRef(new Map<string, SampleInfo>());

  const cancelDwell = useCallback(() => {
    if (dwellRef.current !== null) {
      window.clearTimeout(dwellRef.current);
      dwellRef.current = null;
    }
  }, []);

  // A new run reorders the wire, invalidating cached indices — and any
  // in-flight dwell or fetch, whose key would still match hoverKeyRef
  useEffect(() => {
    infoCache.current.clear();
    cancelDwell();
    cancelClear();
    hoverKeyRef.current = null;
    setHover(null);
    setHoverHit(null);
  }, [datasetName, brainKey]);

  useEffect(
    () => () => {
      cancelDwell();
      cancelClear();
    },
    [],
  );

  const handleHover = (hit: HoverHit | null) => {
    // Every transition restarts the dwell; jitter over one point never
    // reaches here (the picker only reports changes)
    cancelDwell();
    setHoverHit(hit);
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

    // Client-side detail wins: no request, no media decode — and no dwell,
    // which only exists to protect the fetch path
    const local = localDetail?.(hit);
    if (local) {
      setHover(local);
      return;
    }

    // The old card describes the old point
    setHover(null);
    dwellRef.current = window.setTimeout(() => {
      dwellRef.current = null;
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
    }, CARD_DWELL_MS);
  };

  return { hover, hoverHit, handleHover, keepHover: cancelClear };
}

/** How long the card survives the pointer leaving a point. */
const CLEAR_GRACE_MS = 260;
