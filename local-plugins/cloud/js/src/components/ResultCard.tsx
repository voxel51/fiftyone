/**
 * Done or failed. One card, because both end the same way: a summary and a
 * single button back to the start.
 */

import {
  Align,
  Button,
  Card,
  Clickable,
  Collapsible,
  Heading,
  HeadingLevel,
  Icon,
  IconName,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextBadge,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";

import { cloudDatasetUrl, errorMessage } from "../copy";
import { OutcomeInfo, PushData, PushStatus } from "../types";

export interface ResultCardProps {
  push: PushData;
  /** `api_url`, for the (proposed) "Open in FiftyOne Cloud" link. */
  apiUrl: string;
  /** `reset_push` — clears the store key and returns the panel to idle. */
  onReset(): void;
}

export function ResultCard(props: ResultCardProps) {
  const { push, apiUrl, onReset } = props;

  if (push.status === PushStatus.Failed) {
    return (
      <Card>
        <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
          <Heading level={HeadingLevel.H3}>Upload failed</Heading>
          <Text color={TextColor.Destructive}>{errorMessage(push.error)}</Text>
          <Stack orientation={Orientation.Row} align={Align.Start}>
            <Button variant={Variant.Primary} onClick={onReset}>
              Try again
            </Button>
          </Stack>
        </Stack>
      </Card>
    );
  }

  const outcome = push.outcome;
  const link = outcome ? cloudDatasetUrl(apiUrl, outcome.dataset) : null;

  return (
    <Card>
      <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
        <Heading level={HeadingLevel.H3}>Upload complete</Heading>
        {outcome && (
          <>
            <Text>{`${outcome.samples} samples to “${outcome.dataset}”`}</Text>
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              {`${outcome.uploaded} files uploaded` +
                (outcome.skipped_uploads > 0
                  ? `, ${outcome.skipped_uploads} already there`
                  : "")}
            </Text>
            <Badges outcome={outcome} />
            <Rejections outcome={outcome} />
          </>
        )}

        <Stack
          orientation={Orientation.Row}
          align={Align.Center}
          spacing={Spacing.Sm}
        >
          <Button variant={Variant.Primary} onClick={onReset}>
            Upload another
          </Button>
          {/* Rendered only once the Cloud URL pattern is settled. */}
          {link && (
            <Button
              variant={Variant.Secondary}
              trailingIcon={IconName.ExternalLink}
              onClick={() => window.open(link, "_blank", "noopener")}
            >
              Open in FiftyOne Cloud
            </Button>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}

function Badges({ outcome }: { outcome: OutcomeInfo }) {
  const badges: string[] = [];
  if (outcome.rejected_count > 0) {
    badges.push(`${outcome.rejected_count} rejected`);
  }
  if (outcome.shortfall > 0) {
    badges.push(`${outcome.shortfall} short of manifest`);
  }
  if (outcome.missing_files > 0) {
    badges.push(`${outcome.missing_files} missing locally`);
  }

  if (badges.length === 0) {
    return null;
  }

  return (
    <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
      {badges.map((label) => (
        <TextBadge key={label} color={TextColor.Warning}>
          {label}
        </TextBadge>
      ))}
    </Stack>
  );
}

function Rejections({ outcome }: { outcome: OutcomeInfo }) {
  if (outcome.rejected.length === 0) {
    return null;
  }

  return (
    <Collapsible
      header={({ open, toggle }) => (
        <Clickable onClick={toggle}>
          <Stack
            orientation={Orientation.Row}
            align={Align.Center}
            spacing={Spacing.Xs}
          >
            <Icon
              name={open ? IconName.ChevronBottom : IconName.ChevronRight}
              size={Size.Sm}
            />
            <Text variant={TextVariant.Label}>Why were samples rejected?</Text>
          </Stack>
        </Clickable>
      )}
    >
      <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
        {outcome.rejected.map((rejection) => (
          <Text
            key={rejection.index}
            variant={TextVariant.Sm}
            color={TextColor.Secondary}
          >
            {`${rejection.index}: ${rejection.reason}`}
          </Text>
        ))}
        {outcome.rejected_count > outcome.rejected.length && (
          <Text variant={TextVariant.Sm} color={TextColor.Tertiary}>
            {`Showing the first ${outcome.rejected.length} of ` +
              `${outcome.rejected_count} reasons`}
          </Text>
        )}
      </Stack>
    </Collapsible>
  );
}
