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

import styles from "./LoadingScreen.module.css";

/**
 * The App's one loading screen. Every wait that blanks a region renders this,
 * so a second one appearing reads as the same screen rather than a new one.
 */
export default function LoadingScreen({
  children = "Pixelating",
}: {
  children?: string;
}) {
  return (
    <Stack
      align={Align.Center}
      justify={Justify.Center}
      className={styles.screen}
      data-cy="loading-screen"
    >
      <LoadingDots
        text={children}
        variant={TextVariant.Xl}
        color={TextColor.Secondary}
      />
    </Stack>
  );
}
