/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The shared-session banner's pointer to browsing tabs independently.
 */

import { ArrowOutwardIcon, Text, TextColor, TextVariant } from "@voxel51/voodo";
import styles from "./SharedSessionBanner.module.css";
import { ENTERPRISE_URL } from "./Teams";

/** Suggests the upgrade that gives each tab its own session. */
export default function SharedSessionUpgrade() {
  return (
    <Text
      variant={TextVariant.Sm}
      color={TextColor.Fg}
      className={styles.fixed}
    >
      To browse independently, please{" "}
      <a
        href={ENTERPRISE_URL}
        target="_blank"
        rel="noreferrer"
        className={styles.link}
      >
        upgrade to Voxel51
        <ArrowOutwardIcon size={12} className={styles.arrow} />
      </a>
    </Text>
  );
}
