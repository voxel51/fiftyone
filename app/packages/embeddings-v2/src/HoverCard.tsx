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
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import "./panel.css";
import type { HoverHit } from "./renderer";

// Portaled to body, so the tokens its CSS reads must be declared here
const TOKEN_VARS = {
  "--emb-popover": `var(${getColorCssVar(BackgroundColor.Popover)})`,
  "--emb-border-subtle": `var(${getColorCssVar(BorderColor.Subtle)})`,
  "--emb-fg": `var(${getColorCssVar(TextColor.Fg)})`,
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
  /** What the point IS, and when — the card's heading. `note` sits beside the
   * title (a time range, say), so the two read as one line. */
  header?: { title: string; note?: string | null };
  /** Extension-owned media for the card, rendered where `src` would go. Its
   * lifetime IS the card's, so anything it starts is cancelled by the card
   * going away — which is what lets an expensive read hang off a pin. */
  media?: ReactNode;
  /** Cheap per-point detail (multimodal): label/value rows shown instead of
   * an image, e.g. stream — all held client-side */
  details?: { label: string; value: string }[];
}

export default function HoverCard({
  content,
  origin,
  action,
  onKeepHover,
  onLeave,
  onClose,
}: {
  content: HoverContent;
  /** The plot container's viewport offset; `hit.x/y` are relative to it */
  origin: { left: number; top: number };
  /** When set, the card renders the action's button and becomes
   * pointer-interactive (so the button is clickable) */
  action?: { label: string; run: () => void; loading?: boolean };
  /** Keeps the hover alive while the pointer is over the card */
  onKeepHover?: () => void;
  onLeave?: () => void;
  /** Set when the card is FROZEN: a pinned card outlives the pointer, so it
   * needs a way out that leaving does not provide. */
  onClose?: () => void;
}) {
  const { hit, src, value, filename, header, media, details } = content;
  const [settled, setSettled] = useState<{ src: string; ok: boolean } | null>(
    null,
  );
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Portaled so the card can overlay the plot, then flipped and clamped
  // against the viewport using its measured size
  const anchorX = origin.left + hit.x;
  const anchorY = origin.top + hit.y;
  const showImage = src !== null && settled?.ok === true;
  // A variable rather than an inline expression, so the dependency is
  // statically checkable
  const hasAction = action != null;
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
  }, [anchorX, anchorY, showImage, details, value, filename, hasAction]);

  // Preload off-DOM; on failure the metadata still shows
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

  // A click outside the frozen card dismisses it, and still propagates
  useEffect(() => {
    if (!onClose) return undefined;
    const onDown = (event: Event) => {
      if (cardRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    // Capture phase: the plot canvas stopPropagation()s its pointer events,
    // so a bubbling listener never sees an outside click on it
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [onClose]);

  if (src && settled?.src !== src) return null;

  return createPortal(
    <div
      ref={cardRef}
      className="emb-hover-card"
      data-interactive={action || onClose ? "true" : "false"}
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
      {media}
      {header && (
        <div className="emb-hover-header">
          <span className="emb-hover-title" title={header.title}>
            <Text variant={TextVariant.Md} color={TextColor.Fg}>
              {header.title}
            </Text>
          </span>
          {header.note && (
            <span className="emb-hover-note">
              <Text variant={TextVariant.Sm} color={TextColor.Muted}>
                {header.note}
              </Text>
            </span>
          )}
          {onClose && (
            <Button
              variant={Variant.Icon}
              size={Size.Xs}
              leadingIcon={IconName.Close}
              aria-label="Close"
              onClick={onClose}
            />
          )}
        </div>
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
          leadingIcon={action.loading ? IconName.Spinner : IconName.Search}
          disabled={action.loading}
          onClick={action.run}
        >
          {action.label}
        </Button>
      )}
      {/* A card with no header has nowhere to put the close control, so a
          pinned one grows a footer for it rather than becoming untouchable */}
      {onClose && !header && (
        <Button
          variant={Variant.Borderless}
          size={Size.Xs}
          leadingIcon={IconName.Close}
          aria-label="Close"
          onClick={onClose}
        >
          Close
        </Button>
      )}
    </div>,
    document.body,
  );
}
