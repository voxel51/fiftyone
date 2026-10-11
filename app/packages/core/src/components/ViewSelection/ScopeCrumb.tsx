/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Crumb } from "@fiftyone/app-header";
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
    <Crumb
      data-cy="header-scope"
      labelCy="header-scope-name"
      icon={<GridViewIcon size={14} color={IconColor.Default} />}
      label={name || "All samples"}
      trailing={
        total !== null && (
          <Text
            variant={TextVariant.BodySecondary}
            color={TextColor.Tertiary}
            className={styles.count}
            data-cy="header-scope-count"
          >
            {total.toLocaleString()}
          </Text>
        )
      }
    />
  );
}
