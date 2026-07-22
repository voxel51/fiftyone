import { EnterpriseUpsellCallout } from "@fiftyone/components";
import { Button, IconName, Size, Variant } from "@voxel51/voodo";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * AI accent gradient for the button; applied inline over `Variant.Primary`
 * since voodo has no gradient variant. `disabled` fades it to the intended
 * inactive / upsell look.
 */
const AI_TRACK_GRADIENT =
  "linear-gradient(139deg, #CC5200 5.04%, #9A3EDB 103.8%)";

/**
 * Keeps the callout open across the gap between the button and the portaled
 * card, so the pointer can travel into the card to click "Learn more".
 */
const CLOSE_DELAY_MS = 120;

/**
 * Upsell for AI-powered object tracking — a paid feature not available in the
 * open-source app. Renders a disabled "AI Track" button whose only action is a
 * hover callout inviting the user to learn more.
 *
 * The callout is a hover popover, not a `Tooltip`: it must portal above both
 * the annotation modal and the toolbar's clipping (`overflow: hidden`) ancestor,
 * and it stays open while the pointer is over the button OR the card so the CTA
 * stays clickable — a tooltip dismisses the moment the pointer leaves the
 * trigger. Held open by presence of the anchor `rect` (null = closed).
 */
export const AiTrackUpsellButton: React.FC = () => {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const open = () => {
    clearTimeout(closeTimer.current);

    if (anchorRef.current) {
      setRect(anchorRef.current.getBoundingClientRect());
    }
  };

  const scheduleClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setRect(null), CLOSE_DELAY_MS);
  };

  return (
    <span
      ref={anchorRef}
      style={{ display: "inline-flex" }}
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
    >
      {/* `disabled` gives the faded, inactive upsell look. The span (not the
          disabled button) owns the hover — a disabled button swallows its own
          pointer events. */}
      <Button
        variant={Variant.Primary}
        size={Size.Xs}
        leadingIcon={IconName.AI}
        disabled
        aria-label="AI Track"
        data-cy="ai-track-upsell"
        style={{ background: AI_TRACK_GRADIENT }}
      >
        AI Track
      </Button>

      {rect &&
        createPortal(
          <div
            role="dialog"
            aria-label="AI Track is available in FiftyOne Enterprise"
            onMouseEnter={open}
            onMouseLeave={scheduleClose}
            style={{
              position: "fixed",
              // Anchor above the button: pin the card's bottom just over the
              // button's top so it grows upward (the toolbar sits low when the
              // timeline drawer is collapsed, which clips a downward card).
              bottom: window.innerHeight - rect.top + 6,
              left: rect.left,
              width: 320,
              zIndex: "var(--z-above-modal)",
            }}
          >
            <EnterpriseUpsellCallout
              data-cy="ai-track-upsell-callout"
              title="More powerful AI in Enterprise"
              description="Auto-track objects across frames – available in FiftyOne Enterprise."
            />
          </div>,
          document.body,
        )}
    </span>
  );
};
