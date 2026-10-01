/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  Align,
  Button,
  Card,
  CardBackground,
  IconName,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React, { useState } from "react";
import type { DecodeStrategy } from "../utils/decodeStrategy";
import { HoverPopover } from "./HoverPopover";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/** One dim letter per strategy: legible in a screenshot, quiet otherwise. */
const GLYPH: Record<DecodeStrategy, string> = {
  extract: "E",
  fetch: "F",
  html: "V",
};

const DESCRIPTION: Record<DecodeStrategy, string> = {
  extract: "decode the video in the browser",
  fetch: "load extracted frame images",
  html: "play through a <video> element",
};

const STRATEGIES = Object.keys(DESCRIPTION) as DecodeStrategy[];

/** How long a row reads "copied" after its button is clicked. */
const COPIED_MS = 1500;

/** The current page's URL with `video-decode` set to `strategy`. */
export const linkFor = (strategy: DecodeStrategy, href: string): string => {
  const url = new URL(href);
  url.searchParams.set("video-decode", strategy);
  return url.toString();
};

export interface DecodeStrategyReadoutProps {
  strategy: DecodeStrategy;
  /** Why this strategy over `extract`, the preferred one, when known. */
  reason?: string;
  /** The strategy that failed at runtime and was replaced, if any. */
  fellBackFrom?: DecodeStrategy;
  /**
   * Whether the sample has extracted frame images, which `fetch` needs;
   * `fetch` is offered only when this isn't `false`.
   */
  hasFrames?: boolean;
}

/**
 * At the right edge of the timeline controls: one dim letter for how the
 * surface sources its frames (E extract, F fetch, V `<video>`; a trailing dot
 * marks a fallback), so a screenshot says which path ran. Hovering opens a card
 * saying why, with a link per strategy to copy.
 */
export const DecodeStrategyReadout: React.FC<DecodeStrategyReadoutProps> = ({
  strategy,
  reason,
  fellBackFrom,
  hasFrames,
}) => {
  const options = STRATEGIES.filter(
    (option) =>
      option !== strategy && (option !== "fetch" || hasFrames !== false),
  );
  const why = fellBackFrom
    ? `switched from ${fellBackFrom}, which loaded no frames: ${reason}`
    : reason && `why: ${reason}`;
  // all lowercase, worker error text included: a status line, not prose
  const summary = [`${strategy} - ${DESCRIPTION[strategy]}`, why]
    .filter((line): line is string => Boolean(line))
    .map((line) => line.toLowerCase());

  return (
    <HoverPopover
      label={summary.join(" ")}
      width={300}
      content={
        // the card portals out of the DOM but not out of React's tree: a click
        // on it would otherwise reach the controls row and toggle the drawer
        <div onClick={(event) => event.stopPropagation()}>
          <Card
            background={CardBackground.Primary}
            outlined
            data-cy="timeline-decode-strategy-card"
          >
            <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
              {summary.map((line) => (
                <Text key={line} variant={TextVariant.Sm}>
                  {line}
                </Text>
              ))}
              <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
                copy a link to open this sample another way:
              </Text>
              {options.map((option) => (
                <OptionRow key={option} option={option} />
              ))}
            </Stack>
          </Card>
        </div>
      }
    >
      <Text
        variant={TextVariant.Xs}
        color={TextColor.Secondary}
        data-cy="timeline-decode-strategy"
        data-strategy={strategy}
        style={{ fontFamily: MONO, whiteSpace: "nowrap", opacity: 0.55 }}
      >
        {fellBackFrom ? `${GLYPH[strategy]}•` : GLYPH[strategy]}
      </Text>
    </HoverPopover>
  );
};

const OptionRow: React.FC<{ option: DecodeStrategy }> = ({ option }) => {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard
      .writeText(linkFor(option, window.location.href))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_MS);
      })
      // a refused clipboard leaves the icon as it was
      .catch(() => setCopied(false));
  };

  return (
    <Stack
      orientation={Orientation.Row}
      spacing={Spacing.Sm}
      align={Align.Center}
      data-cy={`timeline-decode-strategy-option-${option}`}
    >
      <Text variant={TextVariant.Xs} style={{ fontFamily: MONO, flex: 1 }}>
        {option}
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          {` ${DESCRIPTION[option]}`}
        </Text>
      </Text>
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        leadingIcon={copied ? IconName.Check : IconName.ContentCopy}
        onClick={copy}
        aria-label={copied ? "copied" : `copy a link that opens with ${option}`}
      />
    </Stack>
  );
};
