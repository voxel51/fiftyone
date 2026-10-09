/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  Align,
  Justify,
  LoadingDots,
  Stack,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import type { ReactNode } from "react";

import styles from "./LoadingScreen.module.css";

/**
 * A region that is still filling: the whole area, with what it is waiting on
 * centered in it. Every wait that blanks a region renders this, so a second
 * one appearing reads as the same screen rather than a new one.
 */
export default function LoadingScreen({ text }: { text: ReactNode }) {
  return (
    <Stack
      align={Align.Center}
      justify={Justify.Center}
      className={styles.screen}
    >
      <LoadingDots
        text={text}
        variant={TextVariant.Xl}
        color={TextColor.Secondary}
      />
    </Stack>
  );
}
