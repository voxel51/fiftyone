import {
  Align,
  Button,
  Card,
  CardBackground,
  Icon,
  IconName,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";

/** Accent for the icon, border, and CTA — the "AI" orange used across upsells. */
const AI_ACCENT = "#F5821F";

/** Default destination for the "Learn more" CTA. */
export const ENTERPRISE_LEARN_MORE_URL =
  "https://voxel51.com/why-upgrade?utm_source=FiftyOneApp";

export interface EnterpriseUpsellCalloutProps {
  title: string;
  description: string;
  /**
   * Destination opened by the primary CTA in a new tab. Defaults to
   * {@link ENTERPRISE_LEARN_MORE_URL}.
   */
  learnMoreUrl?: string;
  /** CTA copy; defaults to "Learn more". */
  learnMoreLabel?: string;
  /**
   * When provided, renders a secondary "Dismiss" button wired to this. Omit
   * for a persistent (non-dismissible) callout.
   */
  onDismiss?: () => void;
  /** Leading icon; defaults to the AI sparkle. */
  icon?: IconName;
  "data-cy"?: string;
}

/**
 * Enterprise-upgrade callout card: an AI-accented heading, body copy, a
 * link-out CTA, and an optional dismiss action. Shared across surfaces that
 * promote FiftyOne Enterprise (annotation sidebar, agent selector).
 */
export default function EnterpriseUpsellCallout({
  title,
  description,
  learnMoreUrl = ENTERPRISE_LEARN_MORE_URL,
  learnMoreLabel = "Learn more",
  onDismiss,
  icon = IconName.AI,
  "data-cy": dataCy,
}: EnterpriseUpsellCalloutProps) {
  const learnMore = () =>
    window.open(learnMoreUrl, "_blank", "noopener,noreferrer");

  return (
    <Card
      background={CardBackground.Primary}
      outlined
      style={{ borderColor: AI_ACCENT }}
      data-cy={dataCy}
    >
      <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Sm}
          align={Align.Center}
        >
          <Icon name={icon} size={Size.Md} style={{ color: AI_ACCENT }} />
          <Text>{title}</Text>
        </Stack>

        <Text variant={TextVariant.Md} color={TextColor.Secondary}>
          {description}
        </Text>

        <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
          <Button
            variant={Variant.Primary}
            size={Size.Sm}
            trailingIcon={IconName.ExternalLink}
            onClick={learnMore}
            aria-label={`${learnMoreLabel} about FiftyOne Enterprise`}
          >
            {learnMoreLabel}
          </Button>
          {onDismiss && (
            <Button
              variant={Variant.Secondary}
              size={Size.Sm}
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}
