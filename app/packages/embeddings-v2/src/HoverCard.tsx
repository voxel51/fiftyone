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
  Button,
  getColorCssVar,
  IconName,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import "./panel.css";
import type { HoverHit } from "./renderer";

const TOKEN_VARS = {
  "--emb-popover": `var(${getColorCssVar(BackgroundColor.Popover)})`,
  "--emb-border-subtle": `var(${getColorCssVar(BorderColor.Subtle)})`,
} as CSSProperties;

export interface HoverContent {
  hit: HoverHit;
  /** Resolved image URL, or null when hover media is unavailable — or, for
   * multimodal runs, deliberately skipped (the mcap frame is too expensive) */
  src: string | null;
  /** The point's color-by value, when a color field is active */
  value: { label: string; swatch: string | null } | null;
  /** The sample's media filename (basename), when known */
  filename: string | null;
  /** Cheap per-point detail (multimodal): label/value rows shown instead of
   * an image, e.g. Stream, Time, Model — all held client-side */
  details?: { label: string; value: string }[];
}

export default function HoverCard({
  content,
  origin,
  action,
  onKeepHover,
  onLeave,
}: {
  content: HoverContent;
  /** The plot container's viewport offset; `hit.x/y` are relative to it */
  origin: { left: number; top: number };
  /** When set, the card renders the action's button and becomes
   * pointer-interactive (so the button is clickable) */
  action?: { label: string; run: () => void };
  /** Keeps the hover alive while the pointer is over the card */
  onKeepHover?: () => void;
  onLeave?: () => void;
}) {
  const { hit, src, value, filename, details } = content;
  const [settled, setSettled] = useState<{ src: string; ok: boolean } | null>(
    null,
  );
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // The card must be able to overlay the plot's bounds — a facet cell is
  // often shorter than the card — so it renders in a body portal at fixed
  // viewport coordinates, flipped and clamped against the viewport using
  // its MEASURED size (quadrant-guessing clipped tall cards near edges)
  const anchorX = origin.left + hit.x;
  const anchorY = origin.top + hit.y;
  const showImage = src !== null && settled?.ok === true;
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = anchorX + 14;
    if (left + w > window.innerWidth - 4) left = anchorX - w - 14;
    let top = anchorY + 14;
    if (top + h > window.innerHeight - 4) top = anchorY - h - 14;
    left = Math.max(4, Math.min(left, window.innerWidth - w - 4));
    top = Math.max(4, Math.min(top, window.innerHeight - h - 4));
    setPos({ left, top });
  }, [anchorX, anchorY, showImage, details, value, filename, action != null]);

  // Preload off-DOM; the card appears only once the image is ready — or
  // has failed, in which case the metadata still shows (an unloadable
  // thumbnail must not suppress the value/filename lines)
  useEffect(() => {
    if (!src) return undefined;
    let stale = false;
    const image = new Image();
    image.onload = () => !stale && setSettled({ src, ok: true });
    image.onerror = () => !stale && setSettled({ src, ok: false });
    image.src = src;
    return () => {
      stale = true;
    };
  }, [src]);

  if (src && settled?.src !== src) return null;

  return createPortal(
    <div
      ref={cardRef}
      className="emb-hover-card"
      data-interactive={action ? "true" : "false"}
      onMouseEnter={onKeepHover}
      onMouseLeave={onLeave}
      style={{
        ...TOKEN_VARS,
        position: "fixed",
        zIndex: 1000,
        left: pos?.left ?? anchorX + 14,
        top: pos?.top ?? anchorY + 14,
        // Painted only once measured, so the pre-clamp frame never flashes
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {showImage && (
        <img key={src} src={src} alt="" className="emb-hover-image" />
      )}
      {details?.map((d) => (
        <div className="emb-hover-detail" key={d.label} title={d.value}>
          <Text variant={TextVariant.Sm} color={TextColor.Muted}>
            {d.label}
          </Text>
          <span className="emb-hover-detail-value">
            <Text variant={TextVariant.Sm} color={TextColor.Fg}>
              {d.value}
            </Text>
          </span>
        </div>
      ))}
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
      {action && (
        <Button
          variant={Variant.Secondary}
          size={Size.Xs}
          leadingIcon={IconName.Search}
          onClick={action.run}
        >
          {action.label}
        </Button>
      )}
    </div>,
    document.body,
  );
}
