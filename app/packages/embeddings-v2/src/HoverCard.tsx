/**
 * Hover card for the plot: thumbnail, the point's color-by value (with
 * a swatch matching the point's rendered color), and the sample's
 * filename. Sample ids are intentionally not shown — they carry no
 * meaning for readers, and clicking the point selects the sample in
 * the grid. Renders nothing until the image has loaded (or the sample
 * has no hover media) — an empty box must never appear.
 */
import {
  BackgroundColor,
  BorderColor,
  getColorCssVar,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { useEffect, useState, type CSSProperties } from "react";
import "./panel.css";
import type { HoverHit } from "./renderer";

const TOKEN_VARS = {
  "--emb-popover": `var(${getColorCssVar(BackgroundColor.Popover)})`,
  "--emb-border-subtle": `var(${getColorCssVar(BorderColor.Subtle)})`,
} as CSSProperties;

export interface HoverContent {
  hit: HoverHit;
  /** Resolved image URL, or null when hover media is unavailable */
  src: string | null;
  /** The point's color-by value, when a color field is active */
  value: { label: string; swatch: string | null } | null;
  /** The sample's media filename (basename), when known */
  filename: string | null;
}

export default function HoverCard({
  content,
  containerWidth,
  containerHeight,
}: {
  content: HoverContent;
  containerWidth: number;
  containerHeight: number;
}) {
  const { hit, src, value, filename } = content;
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  // Preload off-DOM; the card appears only once the image is ready
  useEffect(() => {
    if (!src) return undefined;
    let stale = false;
    const image = new Image();
    image.onload = () => !stale && setLoadedSrc(src);
    image.src = src;
    return () => {
      stale = true;
    };
  }, [src]);

  if (src && loadedSrc !== src) return null;

  // Flip the card's quadrant so it stays inside the plot container
  const flipX = hit.x > containerWidth / 2;
  const flipY = hit.y > containerHeight / 2;

  return (
    <div
      className="emb-hover-card"
      style={{
        ...TOKEN_VARS,
        left: hit.x,
        top: hit.y,
        transform: `translate(${flipX ? "calc(-100% - 14px)" : "14px"}, ${
          flipY ? "calc(-100% - 14px)" : "14px"
        })`,
      }}
    >
      {src && <img key={src} src={src} alt="" className="emb-hover-image" />}
      {value && (
        <div className="emb-hover-value">
          {value.swatch && (
            <span
              className="emb-legend-swatch"
              style={{ background: value.swatch }}
            />
          )}
          <span className="emb-hover-text">
            <Text variant={TextVariant.Md} color={TextColor.Fg}>
              {value.label}
            </Text>
          </span>
        </div>
      )}
      {filename && (
        <span className="emb-hover-text">
          <Text variant={TextVariant.Sm} color={TextColor.Muted}>
            {filename}
          </Text>
        </span>
      )}
    </div>
  );
}
