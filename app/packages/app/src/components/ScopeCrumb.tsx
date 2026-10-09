/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  GridViewIcon,
  IconColor,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";

import styles from "./ScopeCrumb.module.css";
import useScope from "./useScope";

/**
 * The breadcrumb's last part: what the samples on screen are — every sample,
 * or the saved query that is loaded — and how many there are.
 */
export default function ScopeCrumb() {
  const { name, total } = useScope();

  return (
    <span className={styles.crumb} data-cy="header-scope">
      <GridViewIcon size={14} color={IconColor.Default} />
      <Text
        variant={TextVariant.HeadingSm}
        color={TextColor.Primary}
        className={styles.name}
        data-cy="header-scope-name"
      >
        {name || "All samples"}
      </Text>
      {total !== null && (
        <Text
          variant={TextVariant.BodySecondary}
          color={TextColor.Tertiary}
          className={styles.count}
          data-cy="header-scope-count"
        >
          {total.toLocaleString()}
        </Text>
      )}
    </span>
  );
}
