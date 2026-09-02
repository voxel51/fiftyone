/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The Enterprise call to action in the header, and the one-time note that
 * introduces it.
 */

import {
  AutoAwesomeIcon,
  Button,
  Heading,
  HeadingLevel,
  Orientation,
  Popover,
  PopoverAnchor,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useCallback, useEffect, useState } from "react";

import styles from "./Teams.module.css";

const ENTERPRISE_TOOLTIP_LS = "fiftyone-enterprise-tooltip-seen";
const ENTERPRISE_URL = "https://voxel51.com/why-upgrade?utm_source=FiftyOneApp";

/** The gradient the sparkle fills with; referenced from the stylesheet. */
const GradientDefs = () => (
  <svg width={0} height={0} aria-hidden="true">
    <defs>
      <linearGradient
        id="fo-enterprise-gradient"
        x1="0%"
        y1="0%"
        x2="100%"
        y2="100%"
      >
        <stop offset="0%" stopColor="#ff6d04" />
        <stop offset="100%" stopColor="#b681ff" />
      </linearGradient>
    </defs>
  </svg>
);

export default function Teams({
  disablePopover = false,
}: {
  disablePopover?: boolean;
}) {
  const [showPopover, setShowPopover] = useState(false);

  useEffect(() => {
    const hasSeenTooltip = window.localStorage.getItem(ENTERPRISE_TOOLTIP_LS);
    // The intro is a one-time nudge for people, not for the e2e harness
    if (!hasSeenTooltip && !window.IS_PLAYWRIGHT) {
      setShowPopover(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(ENTERPRISE_TOOLTIP_LS, "true");
    setShowPopover(false);
  }, []);

  const explore = useCallback(() => {
    dismiss();
    window.open(ENTERPRISE_URL, "_blank");
  }, [dismiss]);

  return (
    <>
      <GradientDefs />
      <Popover
        open={showPopover && !disablePopover}
        onOpenChange={(open) => {
          if (!open) dismiss();
        }}
        anchor={PopoverAnchor.Bottom}
        focusOnOpen={false}
        panelClassName={styles.panel}
        trigger={
          <Button
            variant={Variant.Secondary}
            size={Size.Sm}
            className={styles.cta}
            leadingIcon={AutoAwesomeIcon}
            href={ENTERPRISE_URL}
            target="_blank"
            id="fo-cta-enterprise-button"
          >
            Explore Enterprise
          </Button>
        }
      >
        <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
          <Heading level={HeadingLevel.H4}>Accelerate your workflow</Heading>
          <Text variant={TextVariant.Md} color={TextColor.Secondary}>
            With FiftyOne Enterprise you can connect to your data lake, automate
            your data curation and model analysis tasks, securely collaborate
            with your team, and more.
          </Text>
          <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
            <Button variant={Variant.Primary} size={Size.Md} onClick={explore}>
              Explore Enterprise
            </Button>
            <Button
              variant={Variant.Secondary}
              size={Size.Md}
              onClick={dismiss}
            >
              Dismiss
            </Button>
          </Stack>
        </Stack>
      </Popover>
    </>
  );
}
