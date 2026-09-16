/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { CodeBlock } from "@fiftyone/core";
import { describeAppError } from "@fiftyone/utilities";
import {
  Align,
  Button,
  CloseIcon,
  Heading,
  HeadingLevel,
  Justify,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";

import styles from "./ErrorBoundary.module.css";

/** What the App shows in place of whatever threw. */
export default function ErrorDisplay({
  error,
  onDismiss,
}: {
  error: Error;
  onDismiss?: () => void;
}) {
  const { notFound, sections, title } = describeAppError(error);

  if (notFound) {
    return (
      <Stack
        align={Align.Center}
        justify={Justify.Center}
        className={styles.notFound}
        data-cy="error-boundary"
      >
        <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
          {error.message}
        </Text>
      </Stack>
    );
  }

  return (
    <div className={styles.page} data-cy="error-boundary">
      <Stack
        orientation={Orientation.Column}
        spacing={Spacing.Md}
        className={styles.content}
      >
        <Stack
          orientation={Orientation.Row}
          align={Align.Start}
          justify={Justify.Between}
          spacing={Spacing.Md}
        >
          <Heading level={HeadingLevel.H1}>{title}</Heading>
          {onDismiss && (
            <Button
              variant={Variant.Icon}
              size={Size.Md}
              borderless
              leadingIcon={CloseIcon}
              title="Dismiss"
              aria-label="Dismiss"
              onClick={onDismiss}
            />
          )}
        </Stack>
        {sections.map(({ content, label }) => (
          <Stack
            key={`${label}:${content.slice(0, 32)}`}
            orientation={Orientation.Column}
            spacing={Spacing.Xs}
          >
            {label && <Text color={TextColor.Secondary}>{label}</Text>}
            {content && <CodeBlock code={content} language="javascript" />}
          </Stack>
        ))}
      </Stack>
    </div>
  );
}
