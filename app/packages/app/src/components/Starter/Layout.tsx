/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Highlighted } from "@voxel51/voodo/code";
import { OperatorCore, useOperators } from "@fiftyone/operators";
import {
  Align,
  CodeBlock,
  Divider,
  Orientation,
  Spacing,
  LoadingScreen,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import type { ReactNode } from "react";

import { useProduct } from "../../product";
import styles from "./Starter.module.css";

const useEveryOperator = () => useOperators(true);

/**
 * What an empty App offers: what is missing, what to do about it in the App,
 * and the Python that does the same thing.
 */
export function Layout({
  code,
  codeSubtitle,
  codeTitle,
  subtitle,
  title,
}: {
  code: string;
  codeSubtitle: ReactNode;
  codeTitle: string;
  subtitle: ReactNode;
  title: string;
}) {
  // The operators decide what the subtitle offers, so the screen waits rather
  // than telling someone to install a plugin they already have. Discovery that
  // failed knows of no operators at all, which reads the same way, so the
  // screen drops the offer instead and keeps the code
  // A product registers before the first render, so the hook this resolves to
  // is the same one for the life of the screen
  const useStatus = useProduct().useOperatorsStatus ?? useEveryOperator;
  const { hasError, isLoading } = useStatus();

  if (isLoading) return <LoadingScreen text="Pixelating" />;

  return (
    <>
      {!hasError && <OperatorCore />}
      <Stack
        orientation={Orientation.Column}
        align={Align.Center}
        spacing={Spacing.Xl}
        className={styles.page}
      >
        <Stack
          orientation={Orientation.Column}
          align={Align.Center}
          spacing={Spacing.Xs}
        >
          <Text variant={TextVariant.Lg}>{title}</Text>
          {!hasError && subtitle}
        </Stack>
        <Divider className={styles.divider} />
        <Stack
          orientation={Orientation.Column}
          align={Align.Center}
          spacing={Spacing.Xs}
          className={styles.codeSection}
        >
          <Text variant={TextVariant.Lg}>{codeTitle}</Text>
          <Text color={TextColor.Secondary} className={styles.codeSubtitle}>
            {codeSubtitle}
          </Text>
          <CodeBlock code={code} lineNumbers>
            <Highlighted code={code} />
          </CodeBlock>
        </Stack>
      </Stack>
    </>
  );
}
