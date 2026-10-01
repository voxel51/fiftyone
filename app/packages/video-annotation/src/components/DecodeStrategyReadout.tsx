/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import React from "react";
import type { DecodeStrategy } from "../utils/decodeStrategy";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

const DESCRIPTION: Record<DecodeStrategy, string> = {
  extract: "Decoding the video in the browser",
  fetch: "Loading extracted frame images",
  html: "Playing through a <video> element",
};

export interface DecodeStrategyReadoutProps {
  strategy: DecodeStrategy;
  /** Why this strategy over `extract`, the preferred one, when known. */
  reason?: string;
  /** The strategy that failed at runtime and was replaced, if any. */
  fellBackFrom?: DecodeStrategy;
}

/**
 * Beside the clock: which way the surface sources its frames, so a support
 * session can tell at a glance. The tooltip says why and how to override it.
 */
export const DecodeStrategyReadout: React.FC<DecodeStrategyReadoutProps> = ({
  strategy,
  reason,
  fellBackFrom,
}) => {
  const title = [
    `${DESCRIPTION[strategy]} (${strategy}).`,
    fellBackFrom
      ? `Switched from ${fellBackFrom}, which loaded no frames: ${reason}`
      : reason && `Why: ${reason}.`,
    "Override with ?video-decode=extract|fetch|html in the URL.",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Text
      variant={TextVariant.Xs}
      color={TextColor.Secondary}
      data-cy="timeline-decode-strategy"
      data-strategy={strategy}
      title={title}
      style={{ fontFamily: MONO, whiteSpace: "nowrap" }}
    >
      {fellBackFrom ? `${strategy} (fallback)` : strategy}
    </Text>
  );
};
