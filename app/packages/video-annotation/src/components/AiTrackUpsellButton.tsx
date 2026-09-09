import { EnterpriseUpsellCallout } from "@fiftyone/components";
import { Button, IconName, Size, Variant } from "@voxel51/voodo";
import React from "react";
import { HoverPopover } from "./HoverPopover";

/**
 * AI accent gradient for the button; applied inline over `Variant.Primary`
 * since voodo has no gradient variant. `disabled` fades it to the intended
 * inactive / upsell look.
 */
const AI_TRACK_GRADIENT =
  "linear-gradient(139deg, #CC5200 5.04%, #9A3EDB 103.8%)";

/**
 * Upsell for AI-powered object tracking — a paid feature not available in the
 * open-source app. Renders a disabled "AI Track" button whose only action is a
 * hover callout inviting the user to learn more.
 *
 * The callout is a {@link HoverPopover}, not a `Tooltip`, so the pointer can
 * travel into the card to click "Learn more".
 */
export const AiTrackUpsellButton: React.FC = () => (
  <HoverPopover
    label="AI Track is available in FiftyOne Enterprise"
    content={
      <EnterpriseUpsellCallout
        data-cy="ai-track-upsell-callout"
        title="More powerful AI in Enterprise"
        description="Auto-track objects across frames – available in FiftyOne Enterprise."
      />
    }
  >
    {/* `disabled` gives the faded, inactive upsell look. */}
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
  </HoverPopover>
);
