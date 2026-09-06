/**
 * Pairing. The whole point of the rebuild: the code is large, selectable
 * and copyable, and the approval page is one click — not a sentence in a
 * toast the user has to retype.
 */

import {
  Align,
  Button,
  Card,
  Heading,
  HeadingLevel,
  IconName,
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useEffect, useState } from "react";

import { formatCountdown } from "../copy";
import { PairingDisplay } from "../types";

export interface PairingCardProps {
  pairing: PairingDisplay;
  onCancel(): void;
  onRetry(): void;
}

const COPIED_FOR_MS = 2000;

export function PairingCard(props: PairingCardProps) {
  const { pairing, onCancel, onRetry } = props;
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_FOR_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const expired = Date.parse(pairing.expires_at) <= now;

  return (
    <Card>
      <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
        <Text>Approve this device to finish connecting</Text>

        {/*
          Inline rather than utility classes: the App serves voodo's
          `dist/voodo.css`, which publishes `--font-mono` as a token but
          emits no `.font-mono`, `.tracking-*` or `.select-all` rule. This
          code being large, monospace and select-all is the point of the
          screen, so it cannot depend on classes that are not there.
        */}
        <Heading
          level={HeadingLevel.H1}
          style={{
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.15em",
            userSelect: "all",
          }}
        >
          {pairing.user_code}
        </Heading>

        {expired ? (
          <Stack
            orientation={Orientation.Column}
            spacing={Spacing.Sm}
            align={Align.Start}
          >
            <Text color={TextColor.Destructive}>Pairing expired</Text>
            <Button variant={Variant.Primary} onClick={onRetry}>
              Try again
            </Button>
          </Stack>
        ) : (
          <Stack
            orientation={Orientation.Row}
            spacing={Spacing.Sm}
            align={Align.Center}
          >
            <Button
              variant={Variant.Primary}
              trailingIcon={IconName.ExternalLink}
              onClick={() =>
                window.open(
                  pairing.verification_uri_complete,
                  "_blank",
                  "noopener",
                )
              }
            >
              Open approval page
            </Button>
            <Button
              variant={Variant.Secondary}
              onClick={() => {
                void navigator.clipboard?.writeText(pairing.user_code);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy code"}
            </Button>
          </Stack>
        )}

        <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
          {!expired && (
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              {`expires in ${formatCountdown(pairing.expires_at, now)}`}
            </Text>
          )}
          {/* Shown in full for the case where the popup is blocked. */}
          <Text variant={TextVariant.Sm} color={TextColor.Tertiary}>
            {pairing.verification_uri}
          </Text>
        </Stack>

        <Stack orientation={Orientation.Row} align={Align.Start}>
          <Button variant={Variant.Borderless} onClick={onCancel}>
            Cancel
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
