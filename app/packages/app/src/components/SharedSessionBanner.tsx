/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The warning, above everything else, that other App clients share this
 * server's session.
 */

import { env, isEventSourcePolling } from "@fiftyone/utilities";
import {
  Align,
  BackgroundColor,
  getColorCssVar,
  IconColor,
  Justify,
  Orientation,
  SemanticColor,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  WarningAmberIcon,
} from "@voxel51/voodo";
import type { CSSProperties } from "react";
import { useSharedSessionCount } from "../sharedSession/hooks";
import styles from "./SharedSessionBanner.module.css";
import SharedSessionUpgrade from "./SharedSessionUpgrade";

const TOKENS = {
  "--banner-tint": `var(${getColorCssVar(SemanticColor.Warning)})`,
  "--banner-surface": `var(${getColorCssVar(BackgroundColor.Background)})`,
} as CSSProperties;

const Notice = () => {
  const count = useSharedSessionCount();

  if (count === null) {
    return null;
  }

  return (
    <div
      className={styles.banner}
      style={TOKENS}
      role="status"
      data-cy="shared-session-banner"
    >
      <Stack
        orientation={Orientation.Row}
        align={Align.Center}
        justify={Justify.Center}
        spacing={Spacing.Sm}
        className={styles.content}
      >
        <WarningAmberIcon
          size={Size.Sm}
          color={IconColor.Warning}
          className={styles.fixed}
        />
        <Text
          variant={TextVariant.Sm}
          color={TextColor.Warning}
          className={styles.title}
        >
          Shared session
        </Text>
        <span className={styles.divider} aria-hidden="true" />
        <Text
          variant={TextVariant.Sm}
          color={TextColor.Fg}
          className={styles.message}
        >
          Open in <span className={styles.count}>{count} tabs</span> that share
          the same state and can lead to unexpected behavior.
        </Text>
        <SharedSessionUpgrade />
      </Stack>
    </div>
  );
};

/**
 * Only the stateful App shares its session. Polling event sources are left
 * out because a polling App that leaves stays counted until its lease lapses,
 * well over a minute later. E2E runs open extra pages against one server, and
 * a strip appearing mid-test would shift them.
 */
export default function SharedSessionBanner() {
  if (env().VITE_NO_STATE || isEventSourcePolling() || window.IS_PLAYWRIGHT) {
    return null;
  }

  return <Notice />;
}
