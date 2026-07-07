/**
 * Hover card for the panel: thumbnail + value line, anchored to the
 * hovered point. Renders nothing until the image has loaded (or the
 * sample has no hover media) — an empty box must never appear.
 */
import type { HoverHit } from "./renderer";
import { useEffect, useState } from "react";

export interface HoverContent {
  hit: HoverHit;
  /** Resolved image URL, or null when hover media is unavailable */
  src: string | null;
  lines: string[];
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
  const { hit, src, lines } = content;
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

  const flipX = hit.x > containerWidth / 2;
  const flipY = hit.y > containerHeight / 2;

  return (
    <div
      style={{
        position: "absolute",
        left: hit.x,
        top: hit.y,
        transform: `translate(${flipX ? "calc(-100% - 12px)" : "12px"}, ${
          flipY ? "calc(-100% - 12px)" : "12px"
        })`,
        zIndex: 2,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: 6,
        background: "#16181d",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        borderRadius: 6,
      }}
    >
      {src && (
        <img
          key={src}
          src={src}
          alt=""
          style={{
            width: 140,
            height: 105,
            objectFit: "cover",
            borderRadius: 3,
            display: "block",
          }}
        />
      )}
      <div
        style={{
          maxWidth: 140,
          fontFamily: "monospace",
          fontSize: 11,
          color: "rgb(134, 140, 148)",
        }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
