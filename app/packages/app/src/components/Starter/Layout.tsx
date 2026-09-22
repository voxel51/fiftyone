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
  // The subtitle offers an operator, so the screen waits rather than telling
  // someone to install a plugin they have. Discovery that failed knows of no
  // operators either, so it drops the offer and keeps the code.
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
