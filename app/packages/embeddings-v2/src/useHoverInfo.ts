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
  const hoverIndexRef = useRef<number | null>(null);
  const infoCache = useRef(new Map<string, SampleInfo>());

  // A new run reorders the wire, invalidating cached indices
  useEffect(() => {
    infoCache.current.clear();
    setHover(null);
  }, [datasetName, brainKey]);

  const handleHover = (hit: HoverHit | null) => {
    hoverIndexRef.current = hit?.index ?? null;
    if (!hit || !datasetName || !brainKey) {
      setHover(null);
      return;
    }
    const key = `${brainKey}::${colorField ?? ""}::${hit.index}`;
    const apply = (info: SampleInfo) => {
      // The pointer may have moved on while the info resolved
      if (hoverIndexRef.current !== hit.index) return;

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
