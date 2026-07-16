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
): {
  hover: HoverContent | null;
  handleHover: (hit: HoverHit | null) => void;
} {
  const [hover, setHover] = useState<HoverContent | null>(null);
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
      setHover(null);
      return;
    }
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

  return { hover, handleHover };
}
